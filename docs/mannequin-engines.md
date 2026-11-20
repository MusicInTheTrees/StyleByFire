# Mannequin preview engines

StyleByFire offers three routes from the same saved outfit snapshot. The app includes the connections and preview storage; it does not bundle a local AI model or an OpenAI API key.

| Route | What you need | What happens |
| --- | --- | --- |
| Codex-assisted | A Codex chat with image generation available | Prepare the preview in the app, copy its request into Codex, generate there, then attach the result or refresh after Codex saves it. No API key is needed. |
| Local ComfyUI | A running local ComfyUI installation, model files, and an adapted image-edit workflow | The app sends selected garment images and instructions to ComfyUI on this computer, waits for its output, and saves the result. |
| OpenAI API, optional | An API project with image-model access and a server-side API key | Clicking Generate sends the selected images and styling instructions to OpenAI. API usage is separately billed. |

The generated image is a styling approximation. It cannot establish exact fit, fabric behavior, tailoring, or whether a small accessory was faithfully reconstructed. Compare the result with the reference strip. Corrected colors and stylist notes are included in generation instructions; personal-only notes are excluded. Original clothing photographs remain unchanged.

The reference strip can display the saved photo adjustments, but generation currently receives copies of the original image files. Rotation, crop, exposure, and other editor changes are not baked into those reference pixels. Corrected color labels and stylist notes are supplied as text. If the original photo is misleading, the model must interpret those corrections; the adjusted on-screen thumbnail is not the exact image sent to the engine.

## Codex-assisted

Choose the assisted route when you do not want to configure another engine. Prepare the current selection, use its copied Codex request in this chat, and let Codex generate the image from the saved references. The app cannot invoke the chat's image-generation tool by itself. Refresh the preview after the result is attached. A prepared request alone is not a generated image.

## Set up local generation on Windows

1. Follow the official [Comfy Desktop Windows installation guide](https://docs.comfy.org/installation/desktop/windows). Choose a local installation during first launch and start that instance.
2. Load an image-editing template and its model files. [FLUX.2 Klein 4B image editing](https://docs.comfy.org/tutorials/flux/flux-2-klein) is a smaller multi-reference starting point. [Qwen-Image-2.1 image editing](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) is another option with up to 16 image inputs; its provided edit templates wire 10. Neither is a prevalidated StyleByFire mannequin model.
3. Run a real garment example inside ComfyUI first. The workflow must actually feed every selected garment into the model and produce a saved image. Use local model nodes for this route; a workflow containing cloud or partner nodes can still transmit images externally even though StyleByFire connects to localhost.
4. Adapt the tested workflow using the [workflow adapter guide](comfyui-workflow-adapter.md), then save the API-format JSON under `.data/mannequin/`. That directory is private and ignored by Git.
5. Stop the existing StyleByFire server through its running terminal. In PowerShell, from the StyleByFire repository, configure and start a new server:

```powershell
New-Item -ItemType Directory -Force -Path .data/mannequin | Out-Null
# Save your adapted API export as .data/mannequin/comfy-workflow.json first.
$env:STYLEBYFIRE_COMFYUI_WORKFLOW = (Resolve-Path -LiteralPath .data/mannequin/comfy-workflow.json).Path
$env:STYLEBYFIRE_COMFYUI_URL = 'http://127.0.0.1:8188'
node server.mjs
```

Use the actual port displayed by your ComfyUI instance; Desktop may use a different one. Accepted hosts are `127.0.0.1`, `localhost`, and `[::1]`, using HTTP with no path, credentials, query, or fragment. StyleByFire maps `localhost` to `127.0.0.1`.

These settings apply to the process started in this terminal. A server already running, or one subsequently started by a desktop shortcut, does not inherit changes made only in this PowerShell session. The app does not automatically read `.env` files. Start it from the configured session, or explicitly configure environment variables for your normal launcher and restart it.

Open the preview dialog and refresh engine availability. Local readiness checks that the workflow is readable and ComfyUI answers `/system_stats`; it does not prove that the model is installed, the GPU can fit it, or that an outfit has generated successfully. The actual run validates the selected reference count and ComfyUI validates its model graph. The upload, queue, history, and output steps use ComfyUI's [documented local routes](https://docs.comfy.org/development/comfyui-server/comms_routes).

### What to expect on an 8 GB GPU

ComfyUI reports about 8.4 GB VRAM for its distilled Klein 4B benchmark on an RTX 5090. This does not establish laptop performance. Our inference is that an 8 GB system may require offloading, reduced resolution, or a different compatible configuration. More garment references add work. [Official FLUX.2 Klein workflow details](https://docs.comfy.org/tutorials/flux/flux-2-klein).

Start with a top and bottom, a single output, and a modest portrait resolution. Measure a completed run before increasing the number of garments. ComfyUI supports model offloading, but additional system RAM does not become equivalent GPU memory; transfers may make generation much slower. Consult the [official ComfyUI project](https://github.com/Comfy-Org/ComfyUI) and [system requirements](https://docs.comfy.org/installation/system_requirements) for current platform support. No local benchmark or installation is included with this change.

## Enable the optional OpenAI route

Use the [OpenAI developer quickstart](https://developers.openai.com/api/docs/quickstart) to create a project and API key. Keep that key on the server. Do not paste it into chat, a clothing note, a tracked file, or browser JavaScript.

The following PowerShell example prompts without echoing the key or putting its literal value in command history. Run it from the repository after stopping the existing app server. The key exists in this process's environment while the server runs and is removed from this shell when the command exits.

```powershell
$styleApiSecret = Read-Host 'OpenAI API key' -AsSecureString
try {
    $env:OPENAI_API_KEY = ([System.Net.NetworkCredential]::new('', $styleApiSecret)).Password
    node server.mjs
}
finally {
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    $styleApiSecret.Dispose()
}
```

The implementation defaults to `gpt-image-2.6-sunburst`, with one high-quality `1024x1536` PNG. To choose another compatible GPT Image model, set `STYLEBYFIRE_OPENAI_IMAGE_MODEL` before starting the server. Model access is verified by OpenAI during generation. The API route supports at most 16 garment references and rejects larger selections rather than omitting pieces. These choices follow the [Images edit API reference](https://developers.openai.com/api/reference/resources/images/methods/edit).

**The server key is shared by this app instance.** Every authenticated StyleByFire account using that server can invoke this optional route and incur charges against its configured project. There is currently no per-account API key, spending quota, or allowlist. Enable it only on an instance whose users you trust, and review project usage in the API dashboard. The fake testing account also counts as an authenticated account.

Engine readiness only means a key is configured; checking availability does not make a billed generation request. Photos and styling corrections are sent when Generate is selected. Invalid credentials, unavailable model access, rate limits, and billing errors are reported without exposing the key or provider's raw error body.

## Limits and recovery

| Message or situation | What to do |
| --- | --- |
| ComfyUI is not responding | Start the local instance; check its displayed port against `STYLEBYFIRE_COMFYUI_URL`. |
| Workflow cannot be read as JSON | Check `STYLEBYFIRE_COMFYUI_WORKFLOW`; export API format rather than the visual editor's ordinary workflow format. |
| Workflow must include all selected references | Match `{{image_1}}` through `{{image_N}}` to the number of selected pieces. Never discard a tie, belt, or other accessory just to satisfy the adapter. |
| ComfyUI rejected the workflow | Run it in ComfyUI and resolve missing models, unsupported nodes, and disconnected image inputs. |
| Local model could not finish | Inspect ComfyUI's error details. Reduce resolution or reference count after checking GPU memory and model requirements. |
| Finished without an output image | Add a connected `SaveImage` output. StyleByFire imports the first image marked as an output; preview-only nodes are insufficient. |
| OpenAI credentials or model access rejected | Verify the server's project key and that project's model access. Restart after changing environment settings. |
| OpenAI rate limit or billing credit message | Check API project usage, limits, and billing before retrying. |
| Timeout or cancelled request | Check the engine's queue/history before retrying. The model may continue after the app stops waiting; cancelling the HTTP wait does not undo provider charges. |

Automatic routes wait at most ten minutes. A reference image must be PNG, JPEG, or WebP and no larger than 20 MB; all selected references together must fit within 80 MB. Generated images are limited to 20 MB. Local requests accept up to 20 references, subject to the configured model's lower limits. Preview instructions are limited to 32,000 characters. Long clothing descriptions or stylist notes may need shortening.

The app's preview files remain in the owning account's private storage. ComfyUI also receives copies of input photographs and retains its own generated outputs and history outside StyleByFire. Manage those files in your ComfyUI installation when you no longer need them.
