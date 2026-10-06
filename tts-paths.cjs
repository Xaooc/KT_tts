const fs=require('fs'),os=require('os'),path=require('path');

function ttsCandidates(home=os.homedir()){
  return [
    path.join(home,'Documents','My Games','Tabletop Simulator'),
    path.join(home,'OneDrive','Documents','My Games','Tabletop Simulator'),
    path.join(home,'OneDrive','Документы','My Games','Tabletop Simulator'),
  ];
}

function resolveTtsDir({dir,env=process.env,home=os.homedir(),exists=fs.existsSync}={}){
  if(dir||env.KT_TTS_DIR)return path.resolve(dir||env.KT_TTS_DIR);
  const tried=ttsCandidates(home);
  const found=tried.find(candidate=>exists(candidate));
  if(found)return found;
  throw new Error('Tabletop Simulator data directory not found. Tried:\n'+tried.map(candidate=>'  '+candidate).join('\n')+
    '\nSet KT_TTS_DIR or pass --tts-dir <path>.');
}

function ttsTargets(dir){
  return [path.join(dir,'Mods','Workshop','3573927734_RU.json'),path.join(dir,'Saves','KT24-The-Killzone-RU.json')];
}

module.exports={resolveTtsDir,ttsCandidates,ttsTargets};
