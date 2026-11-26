import test from 'node:test';
import assert from 'node:assert/strict';
import {THEMES,DEFAULT_THEME,savedTheme,themeById,themePatterns} from '../app/theme-packs.js';
import {themePickerMarkup} from '../app/theme-picker.js';

const luminance=hex=>{
 const parts=hex.match(/[\da-f]{2}/gi).map(pair=>parseInt(pair,16)/255);
 const [r,g,b]=parts.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};

test('every selectable pack keeps UI text, buttons, sidebar, and status colors readable',()=>{
 assert.ok(THEMES.length>=5);
 assert.equal(new Set(THEMES.map(theme=>theme.id)).size,THEMES.length);
 for(const theme of THEMES){
  const p=theme.palette;
  for(const [ground,foreground] of [['surface','text'],['surface','muted'],['primary','primaryText'],['sidebar','sidebarText'],['sidebar','sidebarMuted'],['sidebarActive','sidebarText'],['surface','success'],['surface','warning'],['surface','error']]){
   assert.ok(contrast(p[ground],p[foreground])>=4.5,`${theme.id}: ${foreground} on ${ground}`);
  }
  assert.ok(contrast(p.focus,p.surface)>=3&&contrast(p.focus,p.bg)>=3,`${theme.id}: visible focus color`);
  const patterns=themePatterns(theme);
  assert.equal(patterns.main.length,2);
  for(const pattern of [...patterns.main,patterns.sidebar]){
   assert.match(pattern,/gradient\(/);
   assert.doesNotMatch(pattern,/url\(|data:/i,`${theme.id}: patterns must be original CSS`);
  }
 }
});

test('unknown or unavailable theme preference restores the signature default',()=>{
 assert.equal(themeById('not-a-pack').id,DEFAULT_THEME);
 assert.equal(savedTheme({getItem:()=> 'not-a-pack'}),DEFAULT_THEME);
 assert.equal(savedTheme({getItem:()=>{throw Error('Storage blocked');}}),DEFAULT_THEME);
});

test('theme previews show all four app surfaces while using the supplied photo renderer',()=>{
 const calls=[];
 const markup=themePickerMarkup([{name:'Polo',src:'/media/a.jpg'},{name:'Trousers',src:'/media/b.jpg'}],item=>{calls.push(item.name);return `<img src="${item.src}" alt="">`;},value=>value);
 for(const label of ['Wardrobe','Saved looks','Settings','Outfit designer'])assert.match(markup,new RegExp(label));
 assert.equal((markup.match(/data-theme-select=/g)||[]).length,THEMES.length);
 assert.ok(calls.includes('Polo')&&calls.includes('Trousers'));
});
