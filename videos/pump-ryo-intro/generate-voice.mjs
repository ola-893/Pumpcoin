import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url)),lines=JSON.parse(await readFile(new URL('narration-lines.json',import.meta.url),'utf8'));
const cli=process.argv[2];if(!cli)throw new Error('Pass the installed HyperFrames CLI path.');
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,...args],{cwd:root,env:{...process.env,PATH:'/opt/homebrew/opt/node@22/bin:'+process.env.PATH},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>process.stderr.write(x));child.on('exit',code=>code===0?resolve(out):reject(new Error('Local TTS exited '+code)));});}
const voices=[];
for(const line of lines){const rel='assets/voice/'+line.id+'.wav';await run(['tts',line.text,'--voice',line.voice,'--speed',String(line.speed),'--output',rel,'--json']);const meta=await new Promise((resolve,reject)=>{const child=spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','json',rel],{cwd:root});let out='';child.stdout.on('data',x=>out+=x);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(new Error('Probe failed')));});voices.push({...line,path:rel,duration:Number(meta.format.duration)});console.log(JSON.stringify({id:line.id,duration:voices.at(-1).duration,provider:'kokoro-local',paid:false}));}
await writeFile(new URL('voice-metadata.json',import.meta.url),JSON.stringify(voices,null,2)+'\n');
