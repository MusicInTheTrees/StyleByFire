import test from 'node:test';
import assert from 'node:assert/strict';
import {outfitCandidateIssues,outfitCandidates,assessOutfit,generateOutfit,DEFAULT_RULES,DEFAULT_PROFILE} from '../app/domain.js';
const shoe={id:'shoe',name:'Cognac dress shoes',category:'Shoes',role:'base',subcategory:'Dress shoes / Derbies',modes:['Casual','Work','Business'],tags:['dress shoes'],color:'Brown',pattern:'Solid',formality:3,warmth:0,favorite:false,colorVerified:true};
test('eligible shoes are included, while Golf and Sport explain missing footwear',()=>{
 for(const mode of ['Casual','Work','Business']){assert.deepEqual(outfitCandidateIssues(shoe,mode,DEFAULT_RULES[mode],DEFAULT_PROFILE),[]);assert(generateOutfit([shoe],mode,DEFAULT_RULES[mode],DEFAULT_PROFILE).items.some(item=>item.id==='shoe'));}
 const golf=outfitCandidateIssues(shoe,'Golf',DEFAULT_RULES.Golf,DEFAULT_PROFILE);assert(golf.some(issue=>issue.includes('Not marked for Golf')));assert(golf.some(issue=>issue.includes('golf footwear')));assert(generateOutfit([shoe],'Golf',DEFAULT_RULES.Golf,DEFAULT_PROFILE).missing.includes('Shoes'));assert(!assessOutfit([shoe],'Golf',DEFAULT_RULES.Golf,DEFAULT_PROFILE).warnings.some(w=>w.includes('these trainers')));
 assert(outfitCandidateIssues(shoe,'Sport',DEFAULT_RULES.Sport,DEFAULT_PROFILE).some(issue=>issue.includes('Formality')));
});
test('shoe explanations agree with candidate exclusions for availability and avoided tags',()=>{
 const items=[{...shoe,id:'laundry',availability:'laundry'},{...shoe,id:'avoid',tags:['leather']},shoe];const profile={...DEFAULT_PROFILE,avoidTags:['leather']};
 assert(outfitCandidateIssues(items[0],'Business',DEFAULT_RULES.Business,profile).includes('In laundry'));
 assert(outfitCandidateIssues(items[1],'Business',DEFAULT_RULES.Business,profile).includes('Matches a tag you avoid'));
 assert.deepEqual(outfitCandidates(items,'Business',DEFAULT_RULES.Business,profile).map(item=>item.id),['shoe']);
});
