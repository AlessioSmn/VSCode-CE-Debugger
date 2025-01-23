import Handlebars from 'handlebars';

export function formatVmMaps(this: any): string{
	let mem_part: any = [];
	this.vmMaps.forEach(element => {mem_part.push(element)});
	let source = `
		<div>
			<h2>Zone di memoria - vm maps</h2>
			<div>
			{{#each mem_part}}
				<div>
					<h3><span>{{part}}</span></h3>
					<div>
					{{#each info}}
						<p>
							<span class="vm_maps {{t}}">
							{{a}} {{o}} {{x}}
							</span>
						</p>
					{{/each}}
					</div>		
				</div>
			{{/each}}
			</div>
		</div>
	`;
	let template = Handlebars.compile(source);
	return template({mem_part: mem_part});
}
	
export function formatVmTree(this: any): string{
	let vmTreeFirstLevel: any = [];
	this.vmTree.vm_tree.forEach(element => {vmTreeFirstLevel.push(element);});		
	
	let source = `
		<div>
			<h2>Albero di traduzione - vm tree</h2>
			<div class="vm_tree_root">
			{{#each vmTreeFirstLevel}}
				<div data-index-1="{{@index}}" data-opened="0">
					<p onclick="showSubList(this)">
						{{i.o}} - {{i.a}} - {{i.x}}
					</p>
				</div>
			{{/each}}
			</div>
		</div>
	`;

	let template = Handlebars.compile(source);
	return template({vmTreeFirstLevel: vmTreeFirstLevel});
}

export function vmPathAnalyzer(this: any): string{
	let source = `
		<div>
			<h2>Traduzione di un indirizzo virtuale</h2>
			<div style="font-size:x-small; font-style:italic;">
				<p>Note:</p>
				<ul>
					<li>Utilizza l'albero di traduzione del processo in esecuzione</li>
					<li>Richiede un indirizzo espresso in cifre esadecimali</li>
				</ul>
			</div>
			<div style="display: inline-flex; width: 100%;">
				<input type="text" style="display:inline-block; width:50%;" id="vmadd" onkeydown="if(event.key === 'Enter') showTranslationPath();">
				<button onclick="showTranslationPath()" style="display:inline-block; width:auto; padding: 0 20px;">Traduci</button>
			</div>
			<div id="vmPath"></div>
			<div id="vmPathResult"></div>
		</div>
	`;

	let template = Handlebars.compile(source);
	return template();
}
