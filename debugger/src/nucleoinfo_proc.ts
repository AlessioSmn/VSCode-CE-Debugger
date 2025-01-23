import Handlebars from 'handlebars';

export function formatEsecuzione(this: any): string{
	if(isNaN(this.procExecId))
		return `<div><h2>Esecuzione <span class="info title">empty</span></h2></div>`;

	let procExec = this.procList.find(proc => proc.pid == this.procExecId);
	let source = `
	<div>
		<h2>Esecuzione <span class="info title">id: ${procExec.pid}</span></h2>
		<p class="toggle">Informazioni sul processo</p>
		<ul class="p-dump toggable">
			<li class="p-item"><span> pid = </span> <span class="value">{{procExec.pid}}</span></li>			
			<li class="p-item"><span> livello = </span> <span class="value">{{procExec.livello}}</span></li>			
			<li class="p-item"><span> corpo = </span> <span class="value">{{procExec.corpo}}</span></li>			
			<li class="p-item"><span> rip = </span> <span class="value">{{procExec.rip}}</span></li>
			<li class="p-ca-dump-list">
				<div class="toggle"><span>campi aggiuntivi</span><span class="info">: array[]</span></div> 
				<ul class="toggable">
					{{#each procExec.campi_aggiuntivi}}
					<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
					{{/each}}
				</ul>
			</li>
			<li class="p-dump-list "> 
				<div class="toggle"><span>dump Pila</span><span class="info">: array[]</span></div> 
				<ul class="toggable">
					{{#each procExec.pila_dmp}}
					<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
					{{/each}}
				</ul>
			</li>
			<li class="p-dump-list"> 
				<div class="toggle"><span>dump registri</span><span class="info">: array[]</span></div> 
				<ul class="toggable">
					{{#each procExec.reg_dmp}}
					<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
					{{/each}}
				</ul>
			</li>
		</ul>
	</div>
	`;

	let template = Handlebars.compile(source);
	return template({procExec: procExec});
}

export function formatCodaPronti(this: any): string {
    let pronti_count = this.codaPronti.length;
    let pronti_list = this.codaPronti;

    if (pronti_count === 0) {
        return `<div><h2>Coda pronti <span class="info title">empty</span></h2></div>`;
    }

    let source = `
        <div>
            <h2>Coda pronti <span class="info title">${pronti_count} process${pronti_count === 1 ? 'o' : 'i'}</span></h2>
            <div><p>
            {{#each pronti_list}}
                <span class="info">{{this}}</span>
                <span>	
                    {{#unless this}}[DUMMY]{{/unless}}
                    {{#unless @last}} &#8594; {{/unless}}
                </span>
            {{/each}}
            </p></div>
        </div>
    `;

    let template = Handlebars.compile(source);
    return template({ pronti_list: pronti_list });
}

export function formatCodaSospesi(this: any): string{
	let sospesi_count = this.codaSospesi.length;
	let sospesi_list = this.codaSospesi;

	if(sospesi_count == 0)
		return `<div><h2>Processi sospesi <span class="info title">empty</span></h2></div>`;
	
	let source = `
	<div>
		<h2>Processi sospesi <span class="info title">${sospesi_count} process${sospesi_count == 1 ? 'o' : 'i'}</span></h2>
		<div><ul>
			{{#each sospesi_list}}
			<li>
				Process <span class="info">{{process}}</span> - 
				attesa: [<span class="info">+{{attesa_relativa}}</span> | tot: <span class="info">{{attesa_totale}}</span>]
			{{/each}}
			</li>
		</ul></div>
	</div>
	`;

	let template = Handlebars.compile(source);
	return template({sospesi_list: sospesi_list});
}

export function formatSemaphoreList(this: any): string{
	let sem_act_utn_list: any = [];
	let sem_act_sys_list: any = [];
	let sem_inact_utn_list: any = [];
	let sem_inact_sys_list: any = [];

	this.semList.utente.forEach(element => {
		if(element.sem_info.counter < 0) sem_act_utn_list.push(element);
		else sem_inact_utn_list.push(element);
	});

	this.semList.sistema.forEach(element => {
		if(element.sem_info.counter < 0) sem_act_sys_list.push(element);
		else sem_inact_sys_list.push(element);
	});

	let activeSem = sem_act_utn_list.length > 0 || sem_act_sys_list.length > 0;
	let inactiveSem = sem_inact_utn_list.length > 0 || sem_inact_sys_list.length > 0;


	let source = `
	<div>
		<h2>Semafori</h2>

		{{#if activeSem}}
		<div>
			<h3>
				<span>Semafori occupati </span>
				<span class="info">${sem_act_utn_list.length}</span> | 
				<span class="info"> ${sem_act_sys_list.length}</span>
			</h3>
			{{#if sem_act_utn_list}}
				<h4>
					<span>Utente </span>
					<span class="info">${sem_act_utn_list.length}</span>
				</h4>
				{{#each sem_act_utn_list}}
					<div>
						<p>
							Sem [{{index}}]:
							 coda: {
							{{#each sem_info.process_list}}
								<span class="info">{{this}}</span>
								{{#unless this}}[DUMMY]{{/unless}}
								{{#unless @last}}, {{/unless}}
							{{/each}}
							}; counter = {{sem_info.counter}}
						</p>
					</div>
				{{/each}}
			{{/if}}
			{{#if sem_act_sys_list}}
				<h4>
					<span>Sistema </span>
					<span class="info">${sem_act_sys_list.length}</span>
				</h4>
				{{#each sem_act_sys_list}}
					<div>
						<p>
							Sem [{{index}}]:
							 coda: {
							{{#each sem_info.process_list}}
								<span class="info">{{this}}</span>
								{{#unless this}}[DUMMY]{{/unless}}
								{{#unless @last}}, {{/unless}}
							{{/each}}
							}; counter = {{sem_info.counter}}
						</p>
					</div>
				{{/each}}
			{{/if}}
		</div>
		<br>
		{{/if}}

		{{#if inactiveSem}}
		<div>
			<h3>
				<span>Semafori liberi </span>
				<span class="info">${sem_inact_utn_list.length}</span> | 
				<span class="info">${sem_inact_sys_list.length}</span>
			</h3>

			{{#if sem_inact_utn_list}}
				<h4>
					<span>Utente </span>
					<span class="info">${sem_inact_utn_list.length}</span>
				</h4>
				{{#each sem_inact_utn_list}}
					<p>Sem [{{index}}]: counter = {{sem_info.counter}}</p>
				{{/each}}
			{{/if}}

			{{#if sem_inact_sys_list}}
				<h4>
					<span>Sistema </span>
					<span class="info">${sem_inact_sys_list.length}</span>
				</h4>
				{{#each sem_inact_sys_list}}
					<p>Sem [{{index}}]: counter = {{sem_info.counter}}</p>
				{{/each}}
			{{/if}}

		</div>
		{{/if}}
	</div>
	`;

	let template = Handlebars.compile(source);
	return template({
		sem_act_sys_list: sem_act_sys_list, 
		sem_act_utn_list: sem_act_utn_list,
		sem_inact_sys_list: sem_inact_sys_list, 
		sem_inact_utn_list: sem_inact_utn_list,
		activeSem: activeSem,
		inactiveSem: inactiveSem
	});
}

export function formatProcesses(this: any): string{
	let proc_count = this.procList.length;
	let proc_sys: any = [];
	let proc_utn: any = [];
	this.procList.forEach(element => {
		if(element.livello == "sistema") proc_sys.push(element);
		else proc_utn.push(element);
	});

	let source = `
	<div>
		<h2>Processi creati <span class="info">${proc_count}</span></h2>
		<div>
			<h3 class="p-title toggle"><span>Sistema </span><span class="info">${proc_sys.length}</span></h3>
			<div class="toggable">
				{{#each proc_sys}}
					<div>
						<p class="p-title toggle"><span>[{{pid}}]</span></p>
						<ul class="p-dump toggable">
							<li class="p-item"><span> pid = </span> <span class="value">{{pid}}</span></li>			
							<li class="p-item"><span> livello = </span> <span class="value">{{livello}}</span></li>			
							<li class="p-item"><span> corpo = </span> <span class="value">{{corpo}}</span></li>			
							<li class="p-item"><span> rip = </span> <span class="value">{{rip}}</span></li>
							<li class="p-ca-dump-list" >
								<div class="toggle"><span>campi aggiuntivi</span><span class="info">: array[]</span></div> 
								<ul class="toggable">
									{{#each campi_aggiuntivi}}
										<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
									{{/each}}
								</ul>
							</li>
							<li class="p-dump-list "> 
								<div class="toggle"><span>dump Pila</span><span class="info">: array[]</span></div> 
								<ul class="toggable">
									{{#each pila_dmp}}
										<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
									{{/each}}
								</ul>
							</li>
							<li class="p-dump-list"> 
								<div class="toggle"><span>dump registri</span><span class="info">: array[]</span></div> 
								<ul class="toggable">
									{{#each reg_dmp}}
										<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
									{{/each}}
								</ul>
							</li>
						</ul>
					</div>
				{{/each}}
			</div>
		</div>
		<div>
			<h3 class="p-title toggle"><span>Utente </span><span class="info">${proc_utn.length}</span></h3>
			<div class="toggable">
				{{#each proc_utn}}
					<div>
						<p class="p-title toggle"><span>[{{pid}}]</span></p>
						<ul class="p-dump toggable">
							<li class="p-item"><span> pid = </span> <span class="value">{{pid}}</span></li>			
							<li class="p-item"><span> livello = </span> <span class="value">{{livello}}</span></li>			
							<li class="p-item"><span> corpo = </span> <span class="value">{{corpo}}</span></li>			
							<li class="p-item"><span> rip = </span> <span class="value">{{rip}}</span></li>
							<li class="p-ca-dump-list" >
								<div class="toggle"><span>campi aggiuntivi</span><span class="info">: array[]</span></div> 
								<ul class="toggable">
									{{#each campi_aggiuntivi}}
										<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
									{{/each}}
								</ul>
							</li>
							<li class="p-dump-list "> 
								<div class="toggle"><span>dump pila</span><span class="info">: array[]</span></div> 
								<ul class="toggable">
									{{#each pila_dmp}}
										<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
									{{/each}}
								</ul>
							</li>
							<li class="p-dump-list"> 
								<div class="toggle"><span>dump registri</span><span class="info">: array[]</span></div> 
								<ul class="toggable">
									{{#each reg_dmp}}
										<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
									{{/each}}
								</ul>
							</li>
						</ul>
					</div>
				{{/each}}
			</div>
		</div>
	</div>
	`;

	let template = Handlebars.compile(source);
	return template({proc_sys: proc_sys, proc_utn: proc_utn,});
}