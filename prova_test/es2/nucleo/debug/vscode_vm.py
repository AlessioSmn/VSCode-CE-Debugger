import re
import sys
import gdb
import gdb.printing
import struct
import fcntl
import termios
import json
from gdb.FrameDecorator import FrameDecorator


# cache some constants
try:
    max_liv  = int(gdb.parse_and_eval('MAX_LIV'))
except:
    max_liv = 4
try:
    sc_desc  = int(gdb.parse_and_eval('$SEL_CODICE_SISTEMA'))
    uc_desc  = int(gdb.parse_and_eval('$SEL_CODICE_UTENTE'))
    ud_desc  = int(gdb.parse_and_eval('$SEL_DATI_UTENTE'))
except:
    sc_desc = 0x8
    uc_desc = 0x13
    ud_desc = 0x1b

def readfis(addr):
    return struct.unpack('Q', bytes(qemu.read_memory(addr, 8)))[0]

GLOBAL_VAR = 0
cs_cur = 0
wp_cur = 0
def vm_dump_map(v, a):
    global GLOBAL_VAR
    vv = v[:]
    while len(vv) < max_liv:
        vv.append(0)
    vs = []
    if vv[0] >= 256:
        addr = 0xffff
        vs.append("U")
    else:
        addr = 0
        vs.append("S")
    for i in range(max_liv):
        addr = (addr << 9) | vv[i]
        vs.append("{:03o}".format(vv[i]))
    addr <<= 12
    col = 'col_access_rw'
    if not a & 1:
        col = 'col_access_no'
    elif cs_cur and not a & (1 << 2):
        col = 'col_access_no'
    elif (cs_cur or wp_cur) and not a & (1 << 1):
        col = 'col_access_ro'

    GLOBAL_VAR.append("vm_dump_map---1")
    # gdb.write(colorize(col, "{:016x}  {}: {}\n".format(addr, "-".join(vs), vm_access_byte_to_str(a))))


vm_last = 0xffff
def vm_show_maps_rec(tab, liv, virt, cur):
    global vm_last, m_ini, max_liv
    global GLOBAL_VAR

    # counter to keep track of memory area (listed in m_names)
    cur_reg = 0

    # loop over all page entries
    for i in range(512):

        if liv == max_liv and cur_reg < len(m_ini) and i == m_ini[cur_reg]:
            GLOBAL_VAR.append("vm_show_maps_rec---1")
            cur_reg += 1
        
        # get i-th entry
        e = readfis(tab + i * 8)

        # zero all access control bits
        a = e & 0xfff

        if liv > 1 and not a & (1 << 7):
            a &= ~(1 << 5)  # A
            a &= ~(1 << 6)  # D
        if not cur & (1 << 1): # R/W
            a &= ~(1 << 1)
        if not cur & (1 << 2): # U/S
            a &= ~(1 << 2)
        
        virt.append(i)
        
        if a & 1 and liv > 1 and not a & (1 << 7):
            f = e & ~0xfff
            vm_show_maps_rec(f, liv - 1, virt, a)
        
        elif a != vm_last:
            vm_dump_map(virt, a)
            vm_last = a
        
        virt.pop()

def vm_show_maps(cr3):
    global vm_last, cs_cur, wp_cur
    cs_cur = toi(gdb.parse_and_eval('$cs')) & 0x3
    wp_cur = toi(gdb.parse_and_eval('$cr0')) & (1 << 16)
    vm_last = 0xffff

    # recursive call
    vm_show_maps_rec(cr3, max_liv, [], 0x7)


class Vm(gdb.Command):
    """info about virtual memory"""

    def __init__(self):
        super(Vm, self).__init__("vm", gdb.COMMAND_DATA, prefix=True)


class VmMaps(gdb.Command):
    """show the mappings of an address space.
The command acceptes an optional argument which is a process id
('esecuzione->id' is assumed by default).
The command shows a condensed view of the address space of the process,
grouped by sequential addresses which have the same access byte."""

    def __init__(self):
        super(VmMaps, self).__init__("vm maps", gdb.COMMAND_DATA, gdb.COMPLETE_EXPRESSION)

    def invoke(self, arg, from_tty):
        global GLOBAL_VAR
        out = {}
        out['command'] = "vm table"
        out['arg'] = str(arg)

        GLOBAL_VAR = []
        if arg:
            vm_root = toi(gdb.parse_and_eval(arg))
        else:
            vm_root = toi(gdb.parse_and_eval('$cr3'))
        vm_show_maps(vm_root)

        out['ABC'] = GLOBAL_VAR
        gdb.write(json.dumps(out) + '\n')

Vm()
VmMaps()
