const fs=require('fs'),assert=require('assert');
const data=JSON.parse(fs.readFileSync('output/assistant-demo-data.json'));
const graph=JSON.parse(fs.readFileSync('output/assistant-native-scenes.json'));
for(const id of ['activation','shoot','round'])assert(graph.nodes[id]);
const embed=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const template=fs.readFileSync('assistant-preview-template.html','utf8');
const html=template.replace('/*ASSISTANT_DATA*/',()=>embed(data)).replace('/*ASSISTANT_GRAPH*/',()=>embed(graph));
fs.writeFileSync('output/assistant-preview.html',html);console.log({preview:'output/assistant-preview.html',states:Object.keys(graph.nodes).length,installed:false});
