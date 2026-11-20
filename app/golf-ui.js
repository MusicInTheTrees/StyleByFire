import {GOLF_SOURCES} from './golf.js';

export function golfControls(rules){
 return `<fieldset class="golf-controls"><legend>Course dress code</legend>
 <label class="check-row"><input type="checkbox" name="golfCollaredTop" ${rules.golfCollaredTop!==false?'checked':''}>Require a collar, polo or mock-neck top</label>
 <label class="check-row"><input type="checkbox" name="golfTailoredBottoms" ${rules.golfTailoredBottoms!==false?'checked':''}>Use tailored bottoms; avoid denim, cargo and gym styles</label>
 <label class="check-row"><input type="checkbox" name="golfAllowTrainers" ${rules.golfAllowTrainers===true?'checked':''}>Allow trainers when my course permits them</label>
 <p class="field-note">Golf shoes are the default. Items must also be marked Suitable for Golf. These checks use names, subcategories and tags. Pinned exceptions remain visible with an explanation.</p></fieldset>`;
}

export function golfGuide(){
 return `<h3>Dress for your course</h3>
 <p>A polo and tailored bottoms are a useful starting point. Golf dresses and skorts work too; check the club’s collar, sleeve and length requirements. Tucking and footwear policies vary.</p>
 <p>Choose stretch and breathable fabrics, comfortable socks, and golf shoes with suitable traction. Add a light quarter-zip or sweater for cool weather. A belt, cap or visor, sunglasses and golf glove can finish the look; keep accessories comfortable through your swing.</p>
 <h3>Three directions to try</h3>
 <ul><li><strong>Classic:</strong> navy polo, tan trousers and a simple belt.</li><li><strong>Tonal:</strong> blue polo with navy bottoms.</li><li><strong>Pattern-led:</strong> a printed polo with solid bottoms.</li></ul>
 <p>These color combinations are styling suggestions. Your pattern, neutral-color and color-limit preferences still apply.</p>`;
}

export const golfSourceLinks=()=>GOLF_SOURCES.map(([title,url])=>`<a href="${url}" target="_blank" rel="noreferrer">${title} ↗</a>`).join('')+'<small>Reviewed November 20, 2026. PGA competition rules are one example, not a universal course policy. Confirm with your course before playing.</small>';
