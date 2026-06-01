#!/usr/bin/env node
const readline = require('node:readline/promises')
const crypto = require("crypto")
const fs = require("fs")

const menuOptions = [menuSetInput,menuAddJob,menuRunJobs,menuListJobs,menuGetOutput,menuUnlockOutput,menuSaveRecipe,menuLoadRecipe]
const rl = readline.createInterface({input: process.stdin, output: process.stdout});
const env = { input: 'init', jobs:{}, unlocked: true, recipePassword: '', runningJobState: 0, outputs: [], id: crypto.randomBytes(8).toString("hex")}
let loadedRecipe = false

async function sleep(n){
	return new Promise(r=>setTimeout(r,n))
}

async function menuSetInput(){
	env.input = await rl.question('Enter your input: ')
}

async function addToJobList(jobs,opName,jobName){
	let input = env.input
	const operators = {
		'Base64 Encode': e=>(env.outputs.push(btoa(input))),
		'Base64 Decode': e=>(env.outputs.push(atob(input))),
		'Hex Encode': e=>(env.outputs.push(Buffer.from(input).toString('hex'))),
		'Hex Decode': e=>(env.outputs.push(Buffer.from(input,'hex').toString())),
		'Reverse Input': e=>(env.outputs.push(input.split("").reverse().join("")))
	}
	await sleep(Math.floor(Math.random()*1000))
	if(!operators[opName]){
		throw 'Unknown operator'
	}
	jobs[jobName] = operators[opName]
	return jobs
}

async function addJob(opName,jobName,envid){
	let newjobs = await addToJobList(env.jobs,opName,jobName)
	newjobs[jobName].id = envid
	// test this
}

async function menuAddJob(){
	let opName = await rl.question('Enter Operation Name: ')
	let jobName = await rl.question('Enter Job Name: ')
	if(env.jobs[jobName]){
		return console.log('[-] Job Already Exists')
	}
	addJob(opName,jobName,env.id).catch(_=>_)
	console.log('[+] Job Will be added ~~')
}

async function menuRunJobs(){
	if(env.runningJobState != 0){
		return console.log('[-] There currently is a job running')
	}
	env.runningJobState = 1
	new Promise(async _=>{
		for(let n of Object.keys(env.jobs)){
			try {
				if(env.jobs[n].id == env.id){
					env.jobs[n]()
				}
			} catch (e) {
				env.runningJobState = new Error(`Job ${n} Failed`)
				return
			}
			await sleep(Math.floor(Math.random()*1000))
		}
		env.runningJobState = 2
	})
	console.log('[+] Running Jobs ~~')
}

async function menuListJobs(){
	console.log('------------------------')
	console.log('|       JobsList       |')
	console.log('|                      |')
	Object.keys(env.jobs).forEach(e=>console.log(`| - ${e.padEnd(18)} |`))
	console.log('------------------------')
	await sleep(500)
}

async function menuGetOutput(){
	if(env.runningJobState == 0){
		console.log('[+] No job is running')
	} else if(env.runningJobState == 1){
		console.log('[+] Pending ~~')
	} else if(env.runningJobState == 2){
		console.log(`[+] Output: ${env.unlocked ? JSON.stringify(env.outputs) : 'Unlock the Recipe to see the output'}`)
		env.runningJobState = 0
	} else if(env.runningJobState instanceof Error){
		console.log(`[-] ${env.runningJobState.message}`)
	}
}

async function menuUnlockOutput(){
	if(env.unlocked) {
		return console.log('[-] Already Unlocked')
	}
	let passwd = await rl.question('Enter the Password: ')
	if(passwd == env.recipePassword){
		env.unlocked = true
		return console.log('[+] Unlocked!')
	}
	console.log('[-] Wrong Password')	
}

async function menuSaveRecipe(){
	// Currently we only support saving input...
	if(loadedRecipe){
		return console.log('[-] Saving a loaded Recipe is not possible')
	}
	let passwd = await rl.question('Select a password for the recipe: ')
	if(passwd.length < 5){
		return console.log('[-] Choose a more secure password')
	}
	let content = JSON.stringify({
		input: env.input,
		recipePassword: passwd,
	})

	fs.writeFileSync(`./recipes/${env.id}.txt`,content)
	console.log(`[+] Recipe saved. id: ${env.id}`)
}

async function menuLoadRecipe(){
	if(env.runningJobState != 0){
		return console.log('[-] Loading a Recipe is not possible right now')
	}
	let id = await rl.question('Enter Recipe id: ')
	if(!/^[a-z0-9]{16}$/.test(id)){
		return console.log('[-] Bad id')
	}

	let content = JSON.parse(fs.readFileSync(`./recipes/${id}.txt`).toString())
	env.input = content.input
	env.recipePassword = content.recipePassword
	env.unlocked = false
	env.id = id
	env.outputs.splice(0,env.outputs.length)
	loadedRecipe = true
}

function menu(){
	process.stdout.write(`
------------------------
|       CyberPaz       |
|                      |
| 1) Set the input     |
| 2) Add a job         |
| 3) Run jobs          |
| 4) List jobs         |
| 5) Get Output        |
| 6) Unlock Output     |
| 7) Save Recipe       |
| 8) Load Recipe       |
------------------------
	`.trim()+`\n`)
}

(async _=>{
	while(true){
		menu()
		let selection = parseInt(await rl.question('> ')) - 1

		if(typeof menuOptions[selection] == 'function'){
			await menuOptions[selection]()
		} else {
			console.log('[-] Invalid Menu Option')
		}
	}
})()

