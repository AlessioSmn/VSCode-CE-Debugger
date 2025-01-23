import re
import sys
import gdb
import gdb.printing
import struct
import fcntl
import termios
import json
from gdb.FrameDecorator import FrameDecorator

#region Variables and constants
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
past_tables = set()

flags  = { 1: 'W', 2: 'U', 3: 'w', 4: 'c', 5: 'A', 6: 'D', 7: 's' }
nflags = { 1: 'R', 2: 'S', 3: '-', 4: '-', 5: '-', 6: '-', 7: '-' }

# cache some types
des_proc_type = gdb.lookup_type('des_proc')
des_proc_ptr_type = gdb.Type.pointer(des_proc_type)
richiesta_type = gdb.lookup_type('richiesta')
richiesta_ptr_type = gdb.Type.pointer(richiesta_type)
des_sem_type = gdb.lookup_type('des_sem')
des_sem_p = gdb.Type.pointer(des_sem_type)

# which des_proc fields we should show
des_proc_std_fields = [ None, 'id', 'cr3', 'contesto', 'livello', 'precedenza', 'puntatore', 'punt_nucleo', 'corpo', 'parametro' ]
toshow = [ f for f in des_proc_type.fields() if f.name not in des_proc_std_fields ]

# cache the vdf
vdf = gdb.parse_and_eval("vdf")

# cache some constants
max_liv  = int(gdb.parse_and_eval('$MAX_LIV'))
max_sem = int(gdb.parse_and_eval('$MAX_SEM'))
sc_desc  = int(gdb.parse_and_eval('$SEL_CODICE_SISTEMA'))
uc_desc  = int(gdb.parse_and_eval('$SEL_CODICE_UTENTE'))
ud_desc  = int(gdb.parse_and_eval('$SEL_DATI_UTENTE'))
max_proc  = int(gdb.parse_and_eval('$MAX_PROC'))
max_prio = int(gdb.parse_and_eval('$MAX_PRIORITY'))
min_prio = int(gdb.parse_and_eval('$MIN_PRIORITY'))
dummy_prio = int(gdb.parse_and_eval('DUMMY_PRIORITY'))
m_parts = [ 'sis_c', 'sis_p', 'mio_c', 'utn_c', 'utn_p' ]
m_ini = [ int(gdb.parse_and_eval('$I_' + x.upper())) for x in m_parts ]
m_names = []


# cache some types
ulong_type = gdb.lookup_type('unsigned long')
void_ptr_type = gdb.Type.pointer(gdb.lookup_type('void'))

# cache the inferior
qemu = gdb.selected_inferior()

for i, p in enumerate(m_parts):
    tr = { 'sis': 'sistema', 'mio': 'IO', 'utn': 'utente' }
    r, c = m_parts[i].split('_')
    m_names.append(tr[r] + "/" + ('condiviso' if c == 'c' else 'privato'))
m_ini.append(256)

#endregion

#region Utility functions

def resolve_function(f):
    global res_sym
    s = gdb.execute('info symbol 0x{:x}'.format(f), False, True)
    m = res_sym.match(s)
    if not m:
        return (s.rstrip(), '???')
    fun = m.group(1)
    mod = m.group(2) or ''
    return (fun, mod)

def toi(v):
    """convert from gdb.Type to unsigned long"""
    try:
        vi = int(v.cast(ulong_type))
    except:
        vi = v
    if vi < 0:
        vi += 1 << 64
    return vi

def readfis(addr):
    """read an unsigned long from qemu memory"""
    return struct.unpack('Q', bytes(qemu.read_memory(addr, 8)))[0]

registers = [ 'rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15' ]
def show_registers():
    global registers
    for i in range(8):
        gdb.write('{:>3s}: {:016x}                {:>3s}: {:016x}\n'.format(registers[i], toi(gdb.parse_and_eval('$'+registers[i])), registers[i+8], toi(gdb.parse_and_eval('$'+registers[i+8]))))
    gdb.write('RIP: {}\n'.format(gdb.parse_and_eval('$rip')))
    gdb.write('RFLAGS: {}\n'.format(gdb.parse_and_eval('$eflags')))
    #gdb.execute('print $eflags')

def v2p(tab, addr):
    """translate addr in the vm of proc"""
    for i in range(max_liv, 0, -1):
        #gdb.write("--> tab{} @ {:16x}\n".format(i, tab))
        shift = 12 + (i - 1) * 9
        addr2 = tab + ((addr >> shift) & 0x1ff) * 8
        #gdb.write("--> ent{} @ {:16x}\n".format(i, addr2))
        entry = readfis(addr2)
        if not (entry & 0x1):
            return None
        tab = entry & ~0xfff
    return tab | (addr & 0xfff)

def write_key(k, v, indent=0):
    gdb.write("{}{:16s}: {}\n".format(" " * indent, k, v))

def dump_flags(rflags):
    flags = { 14: "NT", 11: "OF", 10: "DF", 9: "IF", 8: "TF", 7: "SF", 6: "ZF", 4: "AF", 2: "PF", 0: "CF" }
    active = []
    for f in flags:
        if rflags & (1 << f):
            active.append(flags[f])
    return "[{} IOPL={}]".format(" ".join(active), "utente" if rflags & 0x3000 == 0x3000 else "sistema")

def vm_paddr_to_str(f):
    s = "0x{:08x}".format(toi(f))
    return s

def show_lines(sal, indent=0):
    res = ""
    curline = sal.line
    fname = sal.symtab.filename
    function = gdb.block_for_pc(sal.pc).function
    res += "file: {} function: {}\n".format(
        fname,
        function)
    lines = gdb.execute("list {}:{}".format(fname, curline), False, True)
    found = False
    for l in lines.splitlines():
        if not found:
            w = l.split()
            if len(w) > 0 and int(w[0]) == curline:
                res += " " * indent +"*" + l + "\n"
                found = True
                continue
        res += " " * (indent + 1) + l + "\n"
    return res

def dump_selector(sel):
    if sel == sc_desc:
        name = "SEL_CODICE_SISTEMA"
    elif sel == uc_desc:
        name = "SEL_CODICE_UTENTE"
    elif sel == ud_desc:
        name = "SEL_DATI_UTENTE"
    elif sel == 0:
        name = "SEL_NULLO"
    else:
        name = "sconosciuto"
    return "[{}]".format(name)

res_sym = re.compile('^(\w+)(?:\(.*\))? in section \.text(?: of .*/(.*))?$')

def is_curproc(p):
    """true if p is the current process"""
    return p['id'] == gdb.parse_and_eval('esecuzione->id')

def get_process(pid):
    """convert from pid to des_proc *"""
    p = gdb.parse_and_eval('proc_table[{}]'.format(pid))
    if p == gdb.Value(0):
        return None
    return p

def dump_corpo(proc):
    c = proc['corpo']
    if not c:
        return ''
    return "{}:{}({})".format(*resolve_function(toi(c))[::-1], toi(proc['parametro']))

#endregion

#region Process functions

def process_dump(pid, proc):
    proc_dmp = {}
    proc_dmp['pid'] = pid
    proc_dmp['livello'] ="utente" if proc['livello'] == gdb.Value(3) else "sistema"
    proc_dmp['corpo'] = dump_corpo(proc)
    vstack = toi(proc['contesto'][4])
    stack = v2p(toi(proc['cr3']), vstack)
    rip = readfis(stack)
    rip_s = "{}".format(gdb.Value(rip).cast(void_ptr_type)).split()
    proc_dmp['rip'] = "{:>18s} {}".format(rip_s[0], " ".join(rip_s[1:]))
    pila_dmp = {}
    pila_dmp['start'] = "{:016x} \u279e {:x}):\n".format(vstack, stack)
    pila_dmp['cs'] =  dump_selector(readfis(stack + 8))
    pila_dmp['rflags'] = dump_flags(readfis(stack + 16))  
    pila_dmp['rsp'] = "{:#18x}".format(readfis(stack + 24)) 
    pila_dmp['ss'] = dump_selector(readfis(stack + 32)) 
    proc_dmp['pila_dmp'] = pila_dmp  
    
    reg_dmp ={}
    for i, r in enumerate(registers):
        reg_dmp[r] = hex(toi(proc['contesto'][i]))
    proc_dmp['reg_dmp'] = reg_dmp  

    cr3 = toi(proc['cr3'])
    proc_dmp['cr3'] = vm_paddr_to_str(cr3)

    if len(toshow) > 0:
        campi_aggiuntivi = {}
        for f in toshow:
            campi_aggiuntivi[f.name] = str(proc[f]),
        proc_dmp['campi_aggiuntivi'] = campi_aggiuntivi  
    
    return proc_dmp

def process_list():
    for pid in range(max_proc):
        p = get_process(pid)
        if p is None:
            continue
        proc = p.dereference()
        yield (pid, proc)

def parse_process(a):
        if not a:
            a = 'esecuzione->id'
        _pid = gdb.parse_and_eval(a)
        pid = 0
        try:
            pid = int(_pid)
        except:
            pass
        if pid != 0xFFFFFFFF:
            p = get_process(pid)
            if p is None:
                return None
            p = p.dereference()
        elif _pid.type == des_proc_ptr_type:
            p = pid.dereference()
        elif _pid.type == des_proc_type:
            p = pid
        else:
            raise TypeError("expression must be a (pointer to) des_proc or a process id")
        return p

def sem_list(lvl='all'):
    if(lvl != 'sis'):
        sem_utn = gdb.parse_and_eval("sem_allocati_utente")
        for i in range(sem_utn):
            s = gdb.parse_and_eval("array_dess[{}]".format(i))
            yield (i, s)

    if(lvl != 'utn'):
        sem_sis = gdb.parse_and_eval("sem_allocati_sistema")
        for i in range(sem_sis):
            s = gdb.parse_and_eval("array_dess[{}]".format(i + max_sem))
            yield (i + max_sem, s)

def show_list_custom_cast(list_name, field, next_elem, cast_function):
    proc_info_list = []
    proc = gdb.parse_and_eval(list_name)
    past_proc = set()

    while proc != gdb.Value(0):

        # Check that list is not recursive
        if int(proc.address) in past_proc:
            break

        # add element to list of visited elements    
        past_proc.add(int(proc.address))

        # access the process struct
        proc = proc.dereference()
        
        # add the process field data to the list
        proc_info_list.append(cast_function(proc[field]))
        
        # fetch the next process
        proc = proc[next_elem]

    return proc_info_list


def Esecuzione():
    exec_pointer = gdb.parse_and_eval('esecuzione')
    if exec_pointer == gdb.Value(0):
        return 'empty'

    exec_pid = int(gdb.parse_and_eval('esecuzione->id'))
    return exec_pid

def Pronti():
    """
    Returns a JSON array containing infomation on 'pronti' list,
    structured as:
    [
        <first process' id>,
        <second process' id>,
        ...,
        <last process' id>
    ]
    """
    return show_list_custom_cast('pronti', 'id', 'puntatore', int)

def Sospesi():
    """
    Returns a JSON array containing infomation on 'sospesi' list,
    structured as:
    [
        {
            "attesa_relativa": <relative wait time (to preceding process)>,
            "attesa_totale": <total wait time>,
            "process": <process' id>
        },
        ...
    ]
    """
    request_list = []
    request = gdb.parse_and_eval("sospesi")
    attesa_tot = 0
    past_request = set()

    while request != gdb.Value(0):

        # check that list is not recursive
        if int(request.address) in past_request:
            break

        # add the element to visited elements
        past_request.add(int(request.address))

        # access the request struct
        request = request.dereference()

        # retrieve request data
        request_data = {}
        attesa = int(request['d_attesa'])
        request_data["attesa_relativa"] = attesa
        attesa_tot = attesa_tot + attesa
        request_data["attesa_totale"] = attesa_tot

        request_data["process"] = int(request['pp'].dereference()['id'])
        
        # add the request data to the list
        request_list.append(request_data)
        
        # fetch the next request
        request = request['p_rich']

    return request_list

def Semaphore():
    """
    Returns a JSON array containing infomation on semaphores,
    structured as:
    {
        "utente": [
                {
                    "index": <semaphore index>
                    "sem_info": {
                        "counter": {semaphore counter}
                        "process_list": [ <pid1>, <pid2>, ..., <pidN> ]
                    }
                }
                ...
            ],
        "sistema": [
                {
                    "index": <semaphore index>
                    "sem_info": {
                        "counter": {semaphore counter}
                        "process_list": [ <pid1>, <pid2>, ..., <pidN> ]
                    }
                }
                ...
            ]
    }
    """
    
    sem_sis = []
    sem_utn = []

    # User semaphore
    for i, s in sem_list('utn'):
        sem = {}
        sem['index'] = i
        sem['sem_info'] = {}
        sem['sem_info']['counter'] = int(s['counter'])
        sem['sem_info']['process_list'] = show_list_custom_cast("array_dess[{}].pointer".format(i), 'id', 'puntatore', int)
        sem_utn.append(sem)

    # System semaphore
    for i, s in sem_list('sis'):
        sem = {}
        sem['index'] = i
        sem['sem_info'] = {}
        sem['sem_info']['counter'] = int(s['counter'])
        sem['sem_info']['process_list'] = show_list_custom_cast("array_dess[{}].pointer".format(i), 'id', 'puntatore', int)
        sem_sis.append(sem)
    
    arr = {
        'utente': sem_utn,
        'sistema': sem_sis
    }

    return arr

def Processes():
    arr = []
    for pid, proc in process_list():
        arr.append(process_dump(pid, proc))
    return arr

class ProcessAll(gdb.Command):

    def __init__(self):
        super(ProcessAll, self).__init__("ProcessAll", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['exec'] = Esecuzione()
        out['pronti'] = Pronti()
        out['sospesi'] = Sospesi()
        out['semaphore'] = Semaphore()
        out['processes'] = Processes()
        gdb.write(json.dumps(out) + "\n")

ProcessAll()

#endregion

#region Memory functions

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
    add_info['a'] = addr
    add_info['x'] = vm_access_byte_to_str(a)
    add_info['o'] = "-".join(vs)
    add_info['t'] = col
    MEM_MAPS[current_part]['info'].append(add_info)

def vm_show_maps_rec(tab, liv, virt, cur):
    '''
        tab:    table address
        liv:    table level
        virt:   array of previous tab entries (composing the path)
        cur:    current access control bits (to check for U/S and R/W rights among the entire path)
    '''
    global vm_last, m_ini, max_liv, current_part, MEM_MAPS, past_tables

    # check that mempry tree is not recursive
    if tab in past_tables:
        return

    past_tables.add(tab)


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

def vm_decode(f, liv, vm_list, stop=max_liv, rngs=[range(512)]*max_liv):
    # Slightly modified from original code:
    #   - previous argument <indent> is removed (no formatting needed)
    #   - previous argument <nonpresent> is always false

    global past_tables

    # check that memory tree is not recursive
    if f in past_tables:
        return
        
    past_tables.add(f)

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
                # o - octal
                tab_entry_data['o'] = tab_entry_index_octal
                # x - access
                tab_entry_data['x'] = tab_entry_access_bits
                # a - address
                tab_entry_data['a'] = tab_address
                # i - info
                tab['i'] = tab_entry_data
                # s - sub list
                tab['s'] = []
                
                # if not frame descriptor at > max_liv, show path for entire tab and append it to the entry
                if not tab_entry & (1<<7):
                    sub_list = []
                    vm_decode(f1, liv - 1, sub_list, stop - 1, rngs)

                    if sub_list:
                        tab['s'].append(sub_list)
                
                vm_list.append(tab)

def VmMaps():
    """
    Show the mappings of an address space.

    The output is formatted as a JSON array, structured as:
    [
        {
            "part": <memory part 1 name>
            "info": {
                [
                    "a": <virtual space address (initial address)>
                    "x": <access control bits>
                    "o": <octal address mapping>
                    "t": <access type (r / w)>
                ],
                [
                    "a": <virtual space address (initial address)>
                    "x": <access control bits>
                    "o": <octal address mapping>
                    "t": <access type (r / w)>
                ]
            }
        },
        ...,
    ]
    """
    global vm_last, cs_cur, wp_cur, m_ini, current_part, MEM_MAPS, past_tables

    # get context
    cs_cur = toi(gdb.parse_and_eval('$cs')) & 0x3
    wp_cur = toi(gdb.parse_and_eval('$cr0')) & (1 << 16)

    # initialize global variables
    vm_last = 0xffff
    current_part = 0
    MEM_MAPS = [None] * (len(m_ini) - 1) # len - 1 to account for mio_p not present
    past_tables = set()

    # recursive call
    cr3 = toi(gdb.parse_and_eval('$cr3'))
    vm_show_maps_rec(cr3, max_liv, [], 0x7)
    
    return MEM_MAPS

def VmTree():
    """
    Show the translation tree of a virtual address space

    The output is formatted as a JSON object, structured as:
    {
        "depth_level": <table levels>
        "vm_tree": [
            {
                "i": {
                    "o": <octal address mapping>
                    "x": <access control bits>
                    "a": <virtual space address (initial address)>
                }
                "s": [
                    {{same estructure as parent node}}
                ]
            },
            ...,
        ]
    }
    """
    global MEM_TREE, past_tables
    MEM_TREE = []
    past_tables = set()
    out = {}
    out['depth_level'] = max_liv
    f = toi(gdb.parse_and_eval('$cr3'))
    vm_decode(f, max_liv, MEM_TREE)
    out['vm_tree'] = MEM_TREE
    return out


class MemoryAll(gdb.Command):

    def __init__(self):
        super(MemoryAll, self).__init__("MemoryAll", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['maps'] = VmMaps()
        out['tree'] = VmTree()
        gdb.write(json.dumps(out) + "\n")

MemoryAll()

#endregion