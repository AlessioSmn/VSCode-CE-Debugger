// @ts-nocheck

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

function getElementSubList(indexArray){
    let elem = vmTreeStringified;

    // Loop over all levels found
    for(let i = 0; i < indexArray.length && elem; i++){
        if(!elem || !elem[indexArray[i]]) return;
        elem = elem[indexArray[i]].sub_list[0];
    }

    return elem;
}

function showSubList(callerElement, PIPPO = false){
    let divCallerElement = callerElement.parentElement;
    let treeIndexes = getListsIndexes(divCallerElement);
    
    let elementLevel = treeIndexes.length + 1;
    let subList = getElementSubList(treeIndexes);

    let i = 0;
    subList.forEach(element => {
        let child = document.createElement("div");
        for(let j = 0; j < treeIndexes.length; j++)
            child.setAttribute("data-index-" + (j+1), treeIndexes[j]);
        child.setAttribute("data-index-" + elementLevel, i);

        let par = document.createElement("p");
        par.onclick = function() { showSubList(par); }; 

        let span_oct = document.createElement("span");
        span_oct.innerText = element.info.octal;
        let span_addr = document.createElement("span");
        span_addr.innerText = element.info.address;
        let span_acc = document.createElement("span");
        span_acc.innerText = element.info.access;
        par.appendChild(span_oct);
        par.innerHTML += " - ";
        par.appendChild(span_addr);
        par.innerHTML += " - ";
        par.appendChild(span_acc);

        child.appendChild(par);
        
        child.style.marginLeft = "20px";
        divCallerElement.appendChild(child);
        i++;
    });
}