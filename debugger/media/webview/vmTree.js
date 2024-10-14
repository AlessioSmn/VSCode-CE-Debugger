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

function clearElementSiblings(element){
    let parentElement = element.parentElement;

    Array.from(parentElement.children).forEach(child => {
        if (child !== element)
            parentElement.removeChild(child);
    });
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

        let childText = document.createElement("p");
        childText.onclick = function() { showSubList(childText); }; 
        childText.innerText = element.info.octal + " - " + element.info.address + " - " + element.info.access;
        childContainer.appendChild(childText);
        
        childContainer.style.marginLeft = "20px";
        divCallerElement.appendChild(childContainer);
        i++;
    });

    divCallerElement.setAttribute("data-opened", 1);
}