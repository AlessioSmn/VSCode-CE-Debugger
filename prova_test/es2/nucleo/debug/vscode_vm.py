import re
import sys
import gdb
import gdb.printing
import struct
import fcntl
import termios
import json
from gdb.FrameDecorator import FrameDecorator

try:
    max_liv  = int(gdb.parse_and_eval('MAX_LIV'))
except:
    max_liv = 4

current_part = 0
MEM_MAPS = {}
cs_cur = 0
wp_cur = 0
MEM_TREE = []
vm_last = 0xffff

flags  = { 1: 'W', 2: 'U', 3: 'w', 4: 'c', 5: 'A', 6: 'D', 7: 's' }
nflags = { 1: 'R', 2: 'S', 3: '-', 4: '-', 5: '-', 6: '-', 7: '-' }

def readfis(addr):
    return struct.unpack('Q', bytes(qemu.read_memory(addr, 8)))[0]

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
        # if access bits are different from last printed space
        elif a != vm_last:
            # print info of virtual address space
            vm_dump_map(virt, a)
            # update access bit information on the last printed space
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

def vm_paddr_to_str(f):
    s = "0x{:08x}".format(toi(f))
    return s 

def vm_decode(f, liv, vm_list, stop=max_liv, rngs=[range(512)]*max_liv):
    # Slightly modified from original code:
    #   - previous argument <indent> is removed (no formatting needed)
    #   - previous argument <nonpresent> is always false

    if liv > 0 and stop > 0:

        # swipe all tab entries
        for i in rngs[liv - 1]:

            # get tab entry
            tab_entry = readfis(f + i * 8)

            # if entry is paged
            if tab_entry & 1:

                # get next table / frame address (zero all access bits)
                f1 = tab_entry & ~0xFFF

                # Get string info on all flags
                fl = []
                for j in flags:
                    fl.append(flags[j] if tab_entry & (1 << j) else nflags[j])

                # write tab entry index in octal representation
                tab_entry_index_octal = ("{:03o}".format(i))

                # construct a string with all access info
                tab_entry_access_bits = "".join(fl)

                # tab address
                tab_address = vm_paddr_to_str(f1)
                
                # append entry and info
                tab = {}
                tab_entry_data = {}
                tab_entry_data['octal'] = tab_entry_index_octal
                tab_entry_data['access'] = tab_entry_access_bits
                tab_entry_data['address'] = tab_address
                tab['info'] = tab_entry_data
                tab['sub_list'] = []
                
                # if not frame descriptor at > max_liv, show path for entire tab and append it to the entry
                if not tab_entry & (1<<7):
                    sub_list = []
                    vm_decode(f1, liv - 1, sub_list, stop - 1, rngs)

                    if sub_list:
                        tab['sub_list'].append(sub_list)
                
                vm_list.append(tab)


class Vm(gdb.Command):

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
                        "access": <access control bits>
                        "octal": <octal address mapping>
                    ],
                    [
                        "address": <virtual space address (initial address)>
                        "access": <access control bits>
                        "octal": <octal address mapping>
                    ]
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

class VmTree(gdb.Command):
    """
    Show the translation tree of a virtual address space
    The command acceptes an optional argument which is a process id ('esecuzione->id' is assumed by default).

    The output is formatted as a JSON object, structured as:
    {
        "command": "vm table"
        "arg": <command argument, empty if no argument is provided>
        "depth_level": <table levels>
        "vm_tree": [
            {
                "info": {
                    "address": <virtual space address (initial address)>
                    "access": <access control bits>
                    "octal": <octal address mapping>
                }
                "sub_list": [
                    {{same estructure as parent node}}
                ]
            },
            ...,
        ]
    }
    """

    def __init__(self):
        super(VmTree, self).__init__("vm tree", gdb.COMMAND_DATA, gdb.COMPLETE_EXPRESSION)

    def invoke(self, arg, from_tty):
        global MEM_TREE
        MEM_TREE = []

        out = {}
        out['command'] = "vm tree"
        out['arg'] = arg
        out['depth_level'] = max_liv

        if arg:
            f = toi(gdb.parse_and_eval(arg))
        else:
            f = toi(gdb.parse_and_eval('$cr3'))

        vm_decode(f, max_liv, MEM_TREE)
        out['vm_tree'] = MEM_TREE

        gdb.write(json.dumps(out) + "\n")

Vm()
VmMaps()
VmTree()

