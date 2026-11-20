# Adapt a ComfyUI workflow for StyleByFire

This guide connects a working local image-edit model to StyleByFire. It is not a complete model download or a validated mannequin workflow. Test the model's result in ComfyUI before using it from the app.

## Start with a working edit graph

The official [FLUX.2 Klein image-edit guide](https://docs.comfy.org/tutorials/flux/flux-2-klein) includes multi-reference examples. For a simple first trial, load its 4B distilled image-edit template, install the required diffusion model, text encoder, and VAE, and use a shirt and trousers as the two references. Prompt it to put those garments on a faceless mannequin. Preserve the complete model, conditioning, sampler, decode, and save branches from that template.

For larger selections, [Qwen-Image-2.1's edit guide](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) documents up to 16 image slots, with ten wired in its edit templates. This is a candidate for adapting a richer outfit; it has not been tested on an 8 GB GPU in this project. Follow the model's own reference ordering and source-image conventions when adapting its text prompt and graph. A model accepting multiple inputs does not guarantee it preserves every garment detail.

For each garment, connect its `LoadImage` branch to the model's reference conditioning. Adding disconnected image nodes does not make the model see them. If your model accepts fewer inputs than the outfit contains, choose a compatible workflow or use the assisted/API route. StyleByFire does not automatically combine the photographs into a collage or silently omit accessories.

Choose one connected `SaveImage` node for the result you want. If the graph has several saved outputs, StyleByFire takes the first output image reported in ComfyUI history. Remove unrelated sample outputs from the exported graph to avoid ambiguity.

## Export and substitute inputs

Enable **Settings → Comfy → Dev Mode → Enable dev mode options (API save, etc.)**, then export in API format. The resulting JSON is an object keyed by node IDs; each node has `class_type` and `inputs`. The ordinary visual workflow export with a top-level `nodes` array is not accepted. See [ComfyUI's dev-mode setting](https://docs.comfy.org/interface/settings/comfy#enable-dev-mode-options-api-save-etc).

In your API export:

1. Replace the positive text/instruction input with `{{prompt}}`. You may add model-specific framing before or after it if needed.
2. Replace the first selected garment's image filename with `{{image_1}}`, the second with `{{image_2}}`, and continue through all selected pieces. Put placeholders in string values, not node IDs or field names.
3. Keep all model filenames, graph connections, and sampler settings from your tested export. Preserve a connected `SaveImage` node.
4. Save the full export as `.data/mannequin/comfy-workflow.json`. Keep the JSON under 1 MB and the graph within 500 nodes.

This **illustrative excerpt is not runnable by itself**. It shows replacements within a complete two-reference API export; the existing model graph supplies the omitted nodes and the example `clip` connection:

```json
{
  "76": {
    "class_type": "LoadImage",
    "inputs": { "image": "{{image_1}}" }
  },
  "81": {
    "class_type": "LoadImage",
    "inputs": { "image": "{{image_2}}" }
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "{{prompt}}",
      "clip": ["EXISTING_CLIP_NODE_ID", 0]
    }
  }
}
```

Node IDs and text-encoding classes vary by model. Use the IDs and fields from your own exported graph; do not replace an image-edit conditioning node with `CLIPTextEncode` just to match this excerpt.

## How the adapter binds an outfit

The saved preview supplies a stable ordered list of garments. The generated prompt labels those same references with numbers. The adapter uploads each original reference to ComfyUI under a unique filename, replaces its matching `{{image_N}}` string, and submits the entire graph to `/prompt`. Substitution operates on parsed JSON values, so quotes in the clothing descriptions do not break the graph.

The uploaded pixels are the original photographs. The app's nondestructive rotation, crop, and color-editor settings are stored in the snapshot but are not rendered into these files. Color labels and stylist corrections appear in the prompt. Account for this distinction when judging the model's result against the adjusted reference strip.

`{{prompt}}` and numbered `{{image_N}}` are the only supported placeholders. Every number from 1 to the selection's count must be present; references beyond that count are rejected. A graph configured for two photographs will not run a seven-piece outfit. Update its reference branches and placeholders, test again, and save the revised API export. The current adapter uses one configured workflow file rather than selecting separate workflows automatically by outfit size.

The adapter checks that the placeholders exist, but cannot prove that a custom model uses them meaningfully. Inspect the completed image for the shirt, bottom or dress, layers, shoes, socks, and each selected accessory. Corrected colors are described in the prompt; a model may still interpret them imperfectly.

## Connect and verify

From a PowerShell terminal opened at the StyleByFire repository, after exporting the workflow and stopping the old app server:

```powershell
$env:STYLEBYFIRE_COMFYUI_WORKFLOW = (Resolve-Path -LiteralPath .data/mannequin/comfy-workflow.json).Path
$env:STYLEBYFIRE_COMFYUI_URL = 'http://127.0.0.1:8188'
node server.mjs
```

Change the port to your running ComfyUI instance's actual port. Keep the server bound to a loopback address. Select the same number of garments that the workflow supports, open the mannequin preview, refresh availability, choose Local ComfyUI, and generate.

A successful adapter run requires image uploads, an accepted prompt ID, completed history with an output image, and a valid downloaded PNG/JPEG/WebP. Those steps follow the [ComfyUI server routes](https://docs.comfy.org/development/comfyui-server/comms_routes) and [official API example](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/websockets_api_example.py). The automated adapter tests simulate those requests; a real installed model run remains necessary to judge visual quality and memory use.

For environment setup, resource expectations, privacy, and troubleshooting, return to [mannequin engine setup](mannequin-engines.md).
