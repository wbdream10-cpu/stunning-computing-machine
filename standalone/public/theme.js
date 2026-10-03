(function(window){
  'use strict';
  const defaults={color:'#b49354',deepColor:'#123f67',aquaColor:'#b8deef'};
  const valid=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value);
  const colors=input=>Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,valid(input?.[key])?input[key].toLowerCase():fallback]));
  const rgb=color=>[1,3,5].map(index=>parseInt(color.slice(index,index+2),16));
  function mix(a,b,amount){const left=rgb(a),right=rgb(b);return '#'+left.map((v,i)=>Math.round(v+(right[i]-v)*amount).toString(16).padStart(2,'0')).join('');}
  function luminance(color){const channels=rgb(color).map(v=>{const s=v/255;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function readable(bg){if(contrast(bg,'#102f4c')>=4.5)return '#102f4c';return contrast(bg,'#000000')>contrast(bg,'#ffffff')?'#000000':'#ffffff';}
  function palette(input){
    const c=colors(input),ink=readable(c.aquaColor),onDeep=readable(c.deepColor),onGold=readable(c.color);
    const away=text=>text==='#ffffff'?'#000000':'#ffffff';
    const aqua=amount=>mix(c.aquaColor,away(ink),amount),deep=amount=>mix(c.deepColor,away(onDeep),amount);
    const values={
      '--accent':c.color,'--theme-gold':c.color,'--theme-gold-light':mix(c.color,away(onGold),.22),'--theme-on-gold':onGold,
      '--theme-aqua':c.aquaColor,'--theme-surface':aqua(.2),'--theme-panel':aqua(.55),'--theme-panel-low':aqua(.28),
      '--theme-quick':aqua(.08),'--theme-input':aqua(.8),'--theme-ink':ink,'--theme-soft':ink,
      '--theme-line':mix(c.aquaColor,ink,.25),'--theme-deep':c.deepColor,'--theme-deep-low':deep(.22),'--theme-deep-high':deep(.08),'--theme-on-deep':onDeep,
      '--theme-on-aqua':ink,'--theme-on-gold-light':readable(mix(c.color,away(onGold),.22))
    };
    return values;
  }
  function apply(root,input){for(const [key,value] of Object.entries(palette(input)))root.style.setProperty(key,value);}
  window.RentalTheme={defaults,valid,colors,palette,apply,contrast};
})(window);
