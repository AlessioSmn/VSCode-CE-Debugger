// @ts-nocheck

// const MAX_LIV = 4;
const PS_bit_value = 's';
const OFFSET_DIGITS_oct = 4;
const TAB_DIGITS_oct = 3;

/**
 * Searches for attributes "data-index-k", with k going from 1 to maxLevel, returns an array of indexes found
 * @param {HTMLElement} element HTML element
 * @param {int} maxLevel Bottom level to begin the search at
 * @returns {array[int]} Array of indexes found, from level 1 to level array.len
 */
function getListsIndexes(element, maxLevel = 4){
    let indexArray = [];
    let level = 1;

    while(level <= maxLevel){
        let attributeName = "data-index-" + level;
        if (element.hasAttribute(attributeName))
            indexArray.push(parseInt(element.getAttribute(attributeName)));
        level++;
    }

    return indexArray;
}

/**
 * Given an array of N indexes, returns a refrence to the N-th level sublist of a tree structure
 * @param {array[int]} indexArray Array of indexes, used to access every sublist
 * @returns {} Reference to the N-th level sublist, accessed using indexArray[i] for every level i
 */
function getElementSubList(indexArray){
    let elem = vmTreeStringified;

    // Loop over all levels found
    for(let i = 0; i < indexArray.length && elem; i++){
        if(!elem || !elem[indexArray[i]]) return;
        elem = elem[indexArray[i]].s[0];
    }

    return elem;
}

/**
 * Deletes all siblings of a given element
 * @param {HTMLElement} element Target element, the only one who will be preserved
 */
function clearElementSiblings(element){
    let parentElement = element.parentElement;

    Array.from(parentElement.children).forEach(child => {
        if (child !== element)
            parentElement.removeChild(child);
    });
}

function createTabEntryParagraph(elementInfo){
    let elemPar = document.createElement("p");
    elemPar.innerText = elementInfo.o + " - " + elementInfo.a + " - " + elementInfo.x;
    return elemPar;
}

function showSubList(callerElement){
    let divCallerElement = callerElement.parentElement;
    let treeIndexes = getListsIndexes(divCallerElement);

    let isAlreadyOpened = parseInt(divCallerElement.getAttribute("data-opened"));
    if(isAlreadyOpened){
        clearElementSiblings(callerElement);
        divCallerElement.setAttribute("data-opened", 0);
        return;
    }
    
    let elementLevel = treeIndexes.length + 1;
    let subList = getElementSubList(treeIndexes);

    let i = 0;
    subList.forEach(element => {
        let childContainer = document.createElement("div");
        for(let j = 0; j < treeIndexes.length; j++)
            childContainer.setAttribute("data-index-" + (j+1), treeIndexes[j]);
        childContainer.setAttribute("data-index-" + elementLevel, i);
        childContainer.setAttribute("data-opened", 0);
        let childText = createTabEntryParagraph(element.i);
        childText.onclick = function() { showSubList(childText); }; 
        childContainer.appendChild(childText);
        
        childContainer.style.marginLeft = "20px";
        divCallerElement.appendChild(childContainer);
        i++;
    });

    divCallerElement.setAttribute("data-opened", 1);
}

/**
 * Fills the vmPathResult container fields with the vm translation output
 * @param {Number} frameAddress Frame address
 * @param {array} vmAddSubdivision original vm address octal subdivision
 * @param {int} level Level of the translation path
 */
function formatVmPathOutput(frameAddress, vmAddSubdivision, level){
    let vmPathOutputContainer = document.getElementById("vmPathResult");
    vmPathOutputContainer.textContent = '';

    // Retireve the frame offset (Depends on wm path level reached)
    let frameOffset = '';
    for(let i = level; i <= MAX_LIV; i++)
        frameOffset += vmAddSubdivision[i];
    frameOffset = parseInt(frameOffset, 8);

    // 1) Print the frame address
    let fpa = document.createElement("p");
    fpa.innerText = "Frame address: 0x" + frameAddress.toString(16).padStart(12, "0");
    vmPathOutputContainer.appendChild(fpa);

    // 2) Print the offset (inside the frame)
    let fo = document.createElement("p");
    fo.innerText = "_Frame offset: 0x" + frameOffset.toString(16).padStart(3, "0");
    vmPathOutputContainer.appendChild(fo);

    // 3) Print final address = 1+2
    let ff = document.createElement("p");
    ff.innerText = "Physical add.: 0x" + (frameAddress + frameOffset).toString(16).padStart(12, "0");
    vmPathOutputContainer.appendChild(ff);

    vmPathOutputContainer.style.paddingLeft = 20*(lev-1) + 'px';
}

/**
 * Given an octal number, searches for a tab entries list and returns its index in the list
 * @param {Number} octal Three digit octal number
 * @param {array} sub_list Tab entry list
 * @returns Returns the index of {octal} in the list
 */
function searchTabEntryByOctal(octal, sub_list){
    // The entries are ordered by their octal value, in increasing order
    if(sub_list.constructor !== Array)
        return -1;

    let base = 0, end = sub_list.length - 1;
    let found = false;
    let middleIndex;

    // Perform a binary search 
    while(!found){
        if(base > end) break;
        middleIndex = Math.floor((end + base)/2);
        let middleElemOctal = sub_list[middleIndex].i.o;
        if(octal == middleElemOctal)
            found = true;
        else{
            if(octal < middleElemOctal) end = middleIndex - 1;
            else base = middleIndex + 1;
        }
    }
    if(found) return middleIndex;
    return -1;
}

function showTranslationPath(){
    let vmAddress = document.getElementById("vmadd");
    let vmPathContainer = document.getElementById("vmPath");

    vmAddress = vmAddress.value;
    vmPathContainer.innerText = '';

    // Check for an hexadecimal address
    if(isNaN(parseInt(vmAddress, 16))){
        vmPathContainer.innerHTML = "Address should be hexadecimal";
        return;
    }
    
    // Check that lenght is 64 bit address, 12 hexadecimal digit
    if(vmAddress.length > 12){
        vmPathContainer.innerText = "Address length should less or equal to 12 hexadecimal digits";
        return;
    }

    // Convert to Octal representation and pad it with initial 0
    vmAddressOctal = parseInt(vmAddress, 16).toString(8);
    vmAddressOctal = vmAddressOctal.padStart(16, '0');

    // Divide the octal address in groups of three (TAB_DIGITS_oct)
    let vmAddressOctalSubdivision = [];
    for(let i = 0; i < MAX_LIV; i++)
        vmAddressOctalSubdivision.push(vmAddressOctal.substring(i*TAB_DIGITS_oct, (i+1)*TAB_DIGITS_oct));
    vmAddressOctalSubdivision.push(vmAddressOctal.substring(MAX_LIV*TAB_DIGITS_oct, MAX_LIV*TAB_DIGITS_oct + OFFSET_DIGITS_oct));
    
    vmInternalPageShift = vmAddressOctal.substring(MAX_LIV*TAB_DIGITS_oct, MAX_LIV*TAB_DIGITS_oct + OFFSET_DIGITS_oct);

    // Print address subdivision
    let vmasub = document.createElement("p");
    vmasub.innerText = "Indirizzo in rappresentazione ottale: ";
    for(let i = 0; i < MAX_LIV; i++)
        vmasub.innerText += vmAddressOctalSubdivision[i] + "-";
    vmasub.innerText += vmAddressOctalSubdivision[MAX_LIV];
    vmPathContainer.appendChild(vmasub);
    vmPathContainer.appendChild(document.createElement("br"));
    vmPathContainer.appendChild(document.createElement("br"));

    let vmTreeNode = vmTreeStringified;
    let lev, frameAddress, found = true;
    for(lev = 0; lev < MAX_LIV; lev++){

        // Search the tab entry index based on the octal triplet
        let subListIndex = searchTabEntryByOctal(vmAddressOctalSubdivision[lev], vmTreeNode);

        // If entry is not page stop here
        if(subListIndex == -1){
            let p = document.createElement("p");
            p.innerText = "Address not paged";
            p.style.paddingLeft = 20*lev + 'px';
            vmPathContainer.appendChild(p);
            found = false;
            break;
        }

        // Print tab entry info
        let p = createTabEntryParagraph(vmTreeNode[subListIndex].i);
        p.style.paddingLeft = 20*lev + 'px';
        vmPathContainer.appendChild(p);
        frameAddress = vmTreeNode[subListIndex].i.a;

        // If entry is paged at higher level
        if(vmTreeNode[subListIndex].i.a[6] == PS_bit_value){
            lev++;
            break;
        }

        // Repeat in the next level
        vmTreeNode = vmTreeNode[subListIndex].s[0];
    }

    vmPathContainer.appendChild(document.createElement("br"));
    vmPathContainer.appendChild(document.createElement("br"));
    
    // Print final physical address 
    if(found)
        formatVmPathOutput(parseInt(frameAddress, 16), vmAddressOctalSubdivision, lev);
    else
        document.getElementById("vmPathResult").textContent = 'AAAA';
}

/*

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

*/