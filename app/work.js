export const DEFAULT_WORK_RULES = {
 minFormality:1,maxFormality:3,maxPatterns:1,maxColors:3,requireSocks:true,includeLayer:false,includeAccessory:true,
 note:'Everyday practical workwear: comfortable shirts or polos, suitable trousers, and footwear for your tasks. Adjust for your workplace and movement needs. Business remains a separate, more tailored look.'
};

// A starting point for everyday work outfits, not a claim about protective equipment.
export function workCandidate(item){
 const text=[item.name,item.subcategory,...(item.tags||[])].join(' ').toLowerCase();
 if(item.formality>3)return false;
 if(item.category==='Top'){
  if(item.role==='dress')return false;
  if(item.role==='outerwear')return /\b(?:work|utility|chore|sweater|cardigan|fleece)\b/.test(text);
  return /\b(?:shirts?|polos?|blouses?|sweaters?)\b|button[ -]down/.test(text);
 }
 if(item.category==='Bottom')return item.role!=='leggings'&&/\b(?:pants|trousers|slacks|chinos|khakis|jeans)\b/.test(text)&&!/\b(?:pajamas|sweatpants)\b/.test(text);
 if(item.category==='Socks')return true;
 if(item.category==='Shoes')return /\b(?:shoes|boots|loafers|sneakers|trainers)\b/.test(text)&&!/\b(?:golf|cleats|slippers)\b/.test(text);
 if(item.category==='Cap')return /\b(?:baseball|flat caps?|scally|beanies?)\b/.test(text);
 if(item.category==='Accessories')return /\b(?:belts?|wallets?|glasses|eyewear|watches|watch|wristbands?)\b/.test(item.subcategory.toLowerCase());
 return false;
}
export function addWorkSuitability(item){
 if(!item.modes.includes('Work')&&workCandidate(item))item.modes.push('Work');
 return item;
}
