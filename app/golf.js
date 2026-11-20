export const DEFAULT_GOLF_RULES = {
 minFormality:1,maxFormality:3,maxPatterns:1,maxColors:3,requireSocks:true,includeLayer:false,includeAccessory:true,
 golfCollaredTop:true,golfTailoredBottoms:true,golfAllowTrainers:false,
 note:'Start with a polo or accepted golf top, tailored trousers, shorts, skort or golf dress, and golf shoes. Check the course policy on collars, tucking, hem length and spikes. Choose fabrics that let you swing comfortably.'
};

// Labels guide suggestions; photos cannot establish fabric performance or course approval.
const labels=item=>[item.name,item.subcategory,...(item.tags||[])].join(' ').toLowerCase();
const golf=item=>/\bgolf\b/.test(labels(item));
const collar=item=>/\bpolos?\b|\bcollared\b|\bmock[ -]?(?:neck|collar)\b|\bturtleneck\b|\bbutton[ -]?(?:down|front)\b/.test(labels(item));
const unsuitableBottom=item=>/\b(?:jeans|denim|cargo|joggers|sweatpants|leggings|cutoffs)\b|\b(?:gym|running|athletic|basketball) shorts\b/.test(labels(item));
const tailored=item=>!unsuitableBottom(item)&&(/\b(?:chinos?|khakis?|slacks|trousers|tailored|skorts?|capris)\b/.test(labels(item))||golf(item));
const golfShoes=item=>golf(item)&&!/\bmetal spikes\b/.test(labels(item));
const trainers=item=>/\b(?:sneakers|trainers|running shoes|athletic shoes|tennis shoes)\b/.test(labels(item));

export function golfCandidate(item){
 if(item.formality>3)return false;
 if(item.category==='Top'){
  if(item.role==='dress')return golf(item);
  if(item.role==='outerwear')return golf(item)||/\b(?:quarter[ -]zip|half[ -]zip|sweater|cardigan|windbreaker)\b/.test(labels(item));
  return golf(item)||/\bpolos?\b/.test(labels(item));
 }
 if(item.category==='Bottom')return item.role!=='leggings'&&tailored(item);
 if(item.category==='Shoes')return golfShoes(item)||trainers(item);
 if(item.category==='Socks')return true;
 if(item.category==='Cap')return golf(item)||/\b(?:baseball|bucket|visor|flat cap|scally)\b/.test(labels(item));
 if(item.category==='Accessories')return /\b(?:belts?|sunglasses|glasses|eye\s*wear|watches|watch|wrist\s*bands?)\b/.test(item.subcategory.toLowerCase());
 return false;
}

export function addGolfSuitability(item){
 if(!item.modes.includes('Golf')&&golfCandidate(item))item.modes.push('Golf');
 return item;
}

export function golfConflicts(item,rules){
 const issues=[];
 if(item.category==='Top'&&item.role!=='outerwear'&&rules.golfCollaredTop!==false&&!collar(item))issues.push('needs a polo, collar or mock-neck label under your Golf top rule');
 if(item.category==='Bottom'&&rules.golfTailoredBottoms!==false&&!tailored(item))issues.push('does not match your tailored Golf bottoms rule');
 if(item.category==='Shoes'&&!(golfShoes(item)||(rules.golfAllowTrainers===true&&trainers(item))))issues.push(rules.golfAllowTrainers?'needs golf-shoe or trainer labels; confirm course approval and grip':'is not labeled as golf footwear; add golf shoes or allow course-approved trainers');
 return issues;
}

export const GOLF_SOURCES = [
 ['Pinehurst · Course dress code','https://www.pinehurst.com/faqs/'],
 ['PGA of Canada · 2026 competition dress code','https://files.pgaofcanada.com/files/pga/images/events/2026/policies/en/dress-code.pdf'],
 ['adidas · Golf clothing, layers and footwear','https://www.adidas.com/us/blog/667683-what-to-wear-golfing-tips-and-recommendations'],
 ['Fossil Trace · Local course guidance','https://fossiltrace.com/faqs/']
];
