import re
import sys
import gdb
import gdb.printing
import struct
import fcntl
import termios
import json
from gdb.FrameDecorator import FrameDecorator

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


sem_utn = gdb.parse_and_eval("sem_allocati_utente")
sem_sys = gdb.parse_and_eval("sem_allocati_sistema")


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
# res_sym = re.compile('.*')

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


def process_dump(pid, proc, indent=0, verbosity=3):
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

    # proc_dmp['nex_ist'] = show_lines(gdb.find_pc_line(rip), indent)
    if len(toshow) > 0:
        campi_aggiuntivi = {}
        for f in toshow:
            campi_aggiuntivi[f.name] = str(proc[f]),
        proc_dmp['campi_aggiuntivi'] = campi_aggiuntivi  
    
    return proc_dmp

def process_list(t='all'):
    for pid in range(max_proc):
        p = get_process(pid)
        if p is None:
            continue
        proc = p.dereference()
        if t == "user" and proc['livello'] != gdb.Value(3):
            continue
        if t == "system" and proc['livello'] == gdb.Value(3):
            continue
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


class Process(gdb.Command):
    """info about processes"""

    def __init__(self):
        super(Process, self).__init__("process", gdb.COMMAND_DATA, prefix=True)

class ProcessDump(gdb.Command):
    """show information from the des_proc of a process.
    The argument can be any expression returning a process id or a des_proc*.
    If no arguments are given, 'esecuzione->id' is assumed."""
    def __init__(self):
        super(ProcessDump, self).__init__("process dump", gdb.COMMAND_DATA, gdb.COMPLETE_EXPRESSION)

    def invoke(self, arg, from_tty):
        p = parse_process(arg)
        if not p:
            raise gdb.GdbError("no such process")
        process_dump(p)

class ProcessList(gdb.Command):
    """list existing processes
    The command accepts an optional argument which may be 'system'
    (show only system processes), 'user' (show only user processes)
    or 'all' (default, show all processes)."""

    def __init__(self):
        super(ProcessList, self).__init__("process list", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['command'] = "process_list"
        out['process'] = []
        for pid, proc in process_list(arg):
            out['process'].append(process_dump(pid, proc, indent=4, verbosity=0))
        # with open('myfile.txt', 'w') as f:
        #     f.write(json.dumps(out))
        gdb.write(json.dumps(out) + "\n")
        
Process()
ProcessDump()
ProcessList()


def sem_list(cond='all'):
    sem = gdb.parse_and_eval("sem_allocati_utente")
    for i in range(sem):
        s = gdb.parse_and_eval("array_dess[{}]".format(i))
        if cond == 'waiting' and s['pointer'] == gdb.Value(0):
            continue
        yield (i, s)
    sem = gdb.parse_and_eval("sem_allocati_sistema")
    for i in range(sem):
        s = gdb.parse_and_eval("array_dess[{}]".format(i + max_sem))
        if cond == 'waiting' and s['pointer'] == gdb.Value(0):
            continue
        yield (i + max_sem, s)

class Semaphore(gdb.Command):
    """
    Returns a JSON string containing infomation on semaphores,
    structured as:
    {
        "command": "semaphore"
        "sem_list": [
            {
                "index": <semaphore index>
                "livello": <utente | sistema>
                "sem_info": {
                    "counter": {semaphore counter}
                    "process_list": [ <pid1>, <pid2>, ..., <pidN> ]
                }
            }
        ]
    }
    """

    def __init__(self):
        super(Semaphore, self).__init__("semaphore", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['command'] = "semaphore"
        out['sem_list'] = []

        # for each semaphore
        for i, s in sem_list(arg):
            sem = {}
            sem['index'] = i
            sem['livello'] = 'utente' if i < sem_utn else 'sistema'
            sem['sem_info'] = {}
            sem['sem_info']['counter'] = int(gdb.parse_and_eval("array_dess[{}].counter".format(i)))
            sem['sem_info']['process_list'] = show_list_custom_cast("array_dess[{}].pointer".format(i), 'id', 'puntatore', int)
            out['sem_list'].append(sem)
        
        gdb.write(json.dumps(out) + "\n")

Semaphore()


def show_list_custom_cast(list_name, field, next_elem, cast_function):
    proc_info_list = []
    proc = gdb.parse_and_eval(list_name)

    while proc != gdb.Value(0):

        # access the process struct
        proc = proc.dereference()
        
        # add the process field data to the list
        proc_info_list.append(cast_function(proc[field]))
        
        # fetch the next process
        proc = proc[next_elem]

    return proc_info_list

class Pronti(gdb.Command):
    """
    Returns a JSON string containing infomation on 'pronti' list,
    structured as:
    {
        "command": "pronti"
        "process_list": [
            <first process' id>,
            <second process' id>,
            ...,
            <last process' id>
        ]
    }
    """

    def __init__(self):
        super(Pronti, self).__init__("pronti", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['command'] = "pronti"
        out['process_list'] = show_list_custom_cast("pronti", 'id', 'puntatore', int)
        gdb.write(json.dumps(out) + "\n")

Pronti()


class Esecuzione(gdb.Command):

    def __init__(self):
        super(Esecuzione, self).__init__("esecuzione", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['command'] = "esecuzione"

        exec_pointer = int(gdb.parse_and_eval("esecuzione"))
        out["pointer"] = exec_pointer

        # if esecuzione == null returns, cannot access any fields
        if exec_pointer == 0:
            gdb.write(json.dumps(out) + "\n")
            return

        exec_pid = int(gdb.parse_and_eval('esecuzione->id'))
        out["pid"] = exec_pid

        out['exec_dump'] = []
        out['exec_dump'].append(process_dump(exec_pid, get_process(exec_pid), indent=4, verbosity=0))

        gdb.write(json.dumps(out) + "\n")

Esecuzione()


class Sospesi(gdb.Command):
    """
    Returns a JSON string containing infomation on 'sospesi' list,
    structured as:
    {
        "command": "sospesi"
        "request_list": [
            {
                "attesa_relativa": <relative wait time (to preceding process)>,
                "attesa_totale": <total wait time>,
                "process": <process' id>
            },
            ...
        ]
    }
    """

    def __init__(self):
        super(Sospesi, self).__init__("sospesi", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):
        out = {}
        out['command'] = "sospesi"

        request_list = []
        request = gdb.parse_and_eval("sospesi")
        attesa_tot = 0

        while request != gdb.Value(0):

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

        out['request_list'] = request_list

        gdb.write(json.dumps(out) + "\n")

Sospesi()
