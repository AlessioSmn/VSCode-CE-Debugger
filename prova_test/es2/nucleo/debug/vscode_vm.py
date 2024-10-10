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

current_part = 0
MEM_MAPS = {}
cs_cur = 0
wp_cur = 0

def vm_access_byte_to_str(a):
    if not a & 1:
        return "unmapped"
    fl = []
    if a & (1 << 2):
        fl.append("U")
    else:
        fl.append("S")
    if a & (1 << 8):
        fl.append("G")
    if a & (1 << 1):
        fl.append("W")
    else:
        fl.append("R")
    if a & (1 << 3):
        fl.append("PWT")
    if a & (1 << 4):
        fl.append("PCD")
    if a & (1 << 7):
        fl.append("PS")
    if a & (1 << 5):
        fl.append("A")
    if a & (1 << 6):
        fl.append("D")
    return " ".join(fl)

def vm_dump_map(v, a):
    '''
    Prints info on virtual address
    Parameters:
        v:      virtual address, composed as array of tab entries
        a:      access bits
    '''

    global MEM_MAPS # stores all data to be printed
    global current_part

    # make sure to always display 12 oct address (so #max_liv table/frame indexes, usually 4 elements)
    vv = v[:]
    while len(vv) < max_liv:
        vv.append(0)

    # virtual address mapping path
    vs = []

    # check if address is Utente (last half) or Sistema (first half)
    if vv[0] >= 0x100:
        addr = 0xffff
        vs.append("U")
    else:
        addr = 0
        vs.append("S")

    # compose the pyhsical address
    # nb: sys mem is mapped at the bottom, so we add 0xffff at the beginning of the address
    for i in range(max_liv):
        addr = (addr << 9) | vv[i]
        vs.append("{:03o}".format(vv[i]))

    # final shift to account for frame dimension
    addr <<= 12

    # access type
    col = "R W"
    if not a & 1:
        col = ""
    elif cs_cur and not a & (1 << 2):
        col = ""
    elif (cs_cur or wp_cur) and not a & (1 << 1):
        col = "R"

    # format address as (a string of) 16 hexadecimal numbers
    addr = ("{:016x}".format(addr))
    
    # append info to global array
    add_info = {}
    add_info['address'] = addr
    add_info['access_control_bits'] = vm_access_byte_to_str(a)
    add_info['addr_octal'] = "-".join(vs)
    add_info['access_type'] = col
    MEM_MAPS[current_part]['info'].append(add_info)
    

"""
 Access controls bits ( liv 4, 3, 2)
 [
    7:  PS - 1 entry is if frame address
    6:  /
    5:  A (Accessed) - 
    4:  /
    3:  /
    2:  U/S - 
    1:  R/W - 1 if write is allowed
    0:  P - 1 if table is mapped
 ]

 Access controls bits ( liv 1)
 [
    6:  D (Data, written) - 1 if write operation has been perfomed
    5:  A (Accessed) - 1 if frame has been accessed
    4:  PCT (Page Cache Disable) - 
    3:  PWT (Page Write Through) - 
    2:  U/S - 
    1:  R/W - 1 if write is allowed
    0:  P - 1 if frame is mapped
 ]
"""
vm_last = 0xffff
def vm_show_maps_rec(tab, liv, virt, cur):
    '''
        tab:    table address
        liv:    table level
        virt:   array of previous tab entries (composing the path)
        cur:    current access control bits (to check for U/S and R/W rights among the entire path)
    '''
    global vm_last, m_ini, max_liv, current_part

    global MEM_MAPS
    # counter to keep track of memory area (listed in m_names)
    cur_reg = 0

    # loop over all page entries
    for i in range(512):

        # if we are at root table (max_liv)
        # m_ini stores the (intial) address of each memory part 
        if liv == max_liv and cur_reg < len(m_ini) and i == m_ini[cur_reg]:
            # inizialize new dictionary for memory part
            MEM_MAPS[cur_reg] = {}
            MEM_MAPS[cur_reg]['part'] = m_names[cur_reg]
            MEM_MAPS[cur_reg]['info'] = []
            current_part = cur_reg
            cur_reg += 1
        
        # get i-th tab entry
        e = readfis(tab + i * 8)

        # get access control bits (12 LSBs)
        a = e & 0xfff

        # if not top level (levels 4, 3, 2) and PS bit = 0
        if liv > 1 and not a & (1 << 7):
            # reset A and D bits
            a &= ~(1 << 5)  # A
            a &= ~(1 << 6)  # D

        # R/W
        # if current access bits have R/W bit = 0 (if Read only)
        if not cur & (1 << 1):
            # reset R/W bit in a
            a &= ~(1 << 1)

        # U/S
        # if current access bits have U/S bit = 0 (if U)
        if not cur & (1 << 2): 
            # reset U/S bit in a
            a &= ~(1 << 2)
        
        # append current tab entry to the list
        virt.append(i)
        
        # if entry is mapped (P = 1), not top level and not frame address -> entry is table address
        if a & 1 and liv > 1 and not a & (1 << 7):
            # get table address
            f = e & ~0xfff
            # recursive call
            vm_show_maps_rec(f, liv - 1, virt, a)
        
        # otherwise (entry is frame address),
        # if access bits ?
        elif a != vm_last:
            # print info of virtual address space
            vm_dump_map(virt, a)
            # ?
            vm_last = a
        
        # empty the virt array (recursive call, only empty current element)
        virt.pop()

def vm_show_maps(cr3):
    global vm_last, cs_cur, wp_cur
    global MEM_MAPS, m_ini, current_part
    # get context
    cs_cur = toi(gdb.parse_and_eval('$cs')) & 0x3
    wp_cur = toi(gdb.parse_and_eval('$cr0')) & (1 << 16)
    vm_last = 0xffff

    current_part = 0

    MEM_MAPS = [None] * len(m_ini)

    # recursive call
    vm_show_maps_rec(cr3, max_liv, [], 0x7)


class Vm(gdb.Command):
    """info about virtual memory"""

    def __init__(self):
        super(Vm, self).__init__("vm", gdb.COMMAND_DATA, prefix=True)

class VmMaps(gdb.Command):
    """
    Show the mappings of an address space.
    The command acceptes an optional argument which is a process id ('esecuzione->id' is assumed by default).

    The output is formatted as a JSON object, structured as:
    {
        "command": "vm table"
        "arg": <command argument, empty if no argument is provided>
        "mem_maps": [
            {
                "part": <memory part 1 name>
                "info": {
                    [
                        "address": <virtual space address (initial address)>
                        "access_control_bits": <access control bits>
                        "addr_octal": <octal address mapping>
                    ],
                    [
                        "address": <virtual space address (initial address)>
                        "access_control_bits": <access control bits>
                        "addr_octal": <octal address mapping>
                    ]
                }
            },
            ...,
            {
                "part": <memory part 2 name>
                "info": {
                    "address": <virtual space address (initial address)>
                    "access_control_bits": <access control bits>
                    "vs": <vs>
                }
            },
            ...,
        ]
    }
    """

    def __init__(self):
        super(VmMaps, self).__init__("vm maps", gdb.COMMAND_DATA, gdb.COMPLETE_EXPRESSION)

    def invoke(self, arg, from_tty):
        global MEM_ALL, MEM_MAPS
        out = {}
        out['command'] = "vm table"
        out['arg'] = str(arg)

        MEM_ALL = []
        if arg:
            vm_root = toi(gdb.parse_and_eval(arg))
        else:
            vm_root = toi(gdb.parse_and_eval('$cr3'))
        vm_show_maps(vm_root)

        out['mem_maps'] = MEM_MAPS
        gdb.write(json.dumps(out) + '\n')

Vm()
VmMaps()