window.opts = {};
window.localization = {};
window.titles = {};
let tabSelected = '';
let txt2img_textarea;
let img2img_textarea;
const wait_time = 800;
const token_timeouts = {};
let uiLoaded = false;

function rememberGallerySelection(name) {
  // dummy
}

function set_theme(theme) {
  const gradioURL = window.location.href;
  if (!gradioURL.includes('?__theme=')) window.location.replace(`${gradioURL}?__theme=${theme}`);
}

function update_token_counter(button_id) {
  if (token_timeouts[button_id]) clearTimeout(token_timeouts[button_id]);
  token_timeouts[button_id] = setTimeout(() => gradioApp().getElementById(button_id)?.click(), wait_time);
}

function clip_gallery_urls(gallery) {
  const files = gallery.map((v) => v.data);
  navigator.clipboard.writeText(JSON.stringify(files)).then(
    () => log('clipboard:', files),
    (err) => console.error('clipboard:', files, err),
  );
}

function all_gallery_buttons() {
  const allGalleryButtons = gradioApp().querySelectorAll('[style="display: block;"].tabitem div[id$=_gallery].gradio-gallery .thumbnails > .thumbnail-item.thumbnail-small');
  const visibleGalleryButtons = [];
  allGalleryButtons.forEach((elem) => {
    if (elem.parentElement.offsetParent) visibleGalleryButtons.push(elem);
  });
  return visibleGalleryButtons;
}

function selected_gallery_button() {
  const allCurrentButtons = gradioApp().querySelectorAll('[style="display: block;"].tabitem div[id$=_gallery].gradio-gallery .thumbnail-item.thumbnail-small.selected');
  let visibleCurrentButton = null;
  allCurrentButtons.forEach((elem) => {
    if (elem.parentElement.offsetParent) visibleCurrentButton = elem;
  });
  return visibleCurrentButton;
}

function selected_gallery_index() {
  const buttons = all_gallery_buttons();
  const button = selected_gallery_button();
  let result = -1;
  buttons.forEach((v, i) => { if (v === button) { result = i; } });
  return result;
}

function extract_image_from_gallery(gallery) {
  if (gallery.length === 0) return [null];
  if (gallery.length === 1) return [gallery[0]];
  let index = selected_gallery_index();
  if (index < 0 || index >= gallery.length) index = 0;
  return [gallery[index]];
}

window.args_to_array = Array.from; // Compatibility with e.g. extensions that may expect this to be around

function switch_to_txt2img(...args) {
  gradioApp().querySelector('#tabs').querySelectorAll('button')[0].click();
  return Array.from(arguments);
}

function switch_to_img2img_tab(no) {
  gradioApp().querySelector('#tabs').querySelectorAll('button')[1].click();
  gradioApp().getElementById('mode_img2img').querySelectorAll('button')[no].click();
}

function switch_to_img2img(...args) {
  switch_to_img2img_tab(0);
  return Array.from(arguments);
}

function switch_to_sketch(...args) {
  switch_to_img2img_tab(1);
  return Array.from(arguments);
}

function switch_to_inpaint(...args) {
  switch_to_img2img_tab(2);
  return Array.from(arguments);
}

function switch_to_inpaint_sketch(...args) {
  switch_to_img2img_tab(3);
  return Array.from(arguments);
}

function switch_to_extras(...args) {
  gradioApp().querySelector('#tabs').querySelectorAll('button')[2].click();
  return Array.from(arguments);
}

function get_tab_index(tabId) {
  let res = 0;
  gradioApp().getElementById(tabId).querySelector('div').querySelectorAll('button')
    .forEach((button, i) => {
      if (button.className.indexOf('selected') !== -1) res = i;
    });
  return res;
}

function create_tab_index_args(tabId, args) {
  const res = Array.from(args);
  res[0] = get_tab_index(tabId);
  return res;
}

function get_img2img_tab_index(...args) {
  const res = Array.from(arguments);
  res.splice(-2);
  res[0] = get_tab_index('mode_img2img');
  return res;
}

function create_submit_args(args) {
  const res = Array.from(args);
  // As it is currently, txt2img and img2img send back the previous output args (txt2img_gallery, generation_info, html_info) whenever you generate a new image.
  // This can lead to uploading a huge gallery of previously generated images, which leads to an unnecessary delay between submitting and beginning to generate.
  // I don't know why gradio is sending outputs along with inputs, but we can prevent sending the image gallery here, which seems to be an issue for some.
  // If gradio at some point stops sending outputs, this may break something
  if (Array.isArray(res[res.length - 3])) res[res.length - 3] = null;
  return res;
}

function showSubmitButtons(tabname, show) {}

function clearGallery(tabname) {
  const gallery = gradioApp().getElementById(`${tabname}_gallery`);
  gallery.classList.remove('logo');
  // gallery.style.height = window.innerHeight - gallery.getBoundingClientRect().top - 200 + 'px'
  const footer = gradioApp().getElementById(`${tabname}_footer`);
  footer.style.display = 'flex';
}

function submit(...args) {
  log('submitTxt');
  clearGallery('txt2img');
  const id = randomId();
  requestProgress(id, null, gradioApp().getElementById('txt2img_gallery'));
  const res = create_submit_args(args);
  res[0] = id;
  return res;
}

function submit_img2img(...args) {
  log('submitImg');
  clearGallery('img2img');
  const id = randomId();
  requestProgress(id, null, gradioApp().getElementById('img2img_gallery'));
  const res = create_submit_args(args);
  res[0] = id;
  res[1] = get_tab_index('mode_img2img');
  return res;
}

function submit_postprocessing(...args) {
  log('SubmitExtras');
  clearGallery('extras');
  return args;
}

function modelmerger(...args) {
  const id = randomId();
  const res = create_submit_args(args);
  res[0] = id;
  return res;
}

function ask_for_style_name(_, prompt_text, negative_prompt_text) {
  const name = prompt('Style name:'); // eslint-disable-line no-alert
  return [name, prompt_text, negative_prompt_text];
}

function confirm_clear_prompt(prompt, negative_prompt) {
  prompt = '';
  negative_prompt = '';
  return [prompt, negative_prompt];
}

const promptTokecountUpdateFuncs = {};

function recalculatePromptTokens(name) {
  if (promptTokecountUpdateFuncs[name]) {
    promptTokecountUpdateFuncs[name]();
  }
}

function recalculate_prompts_txt2img(...args) {
  recalculatePromptTokens('txt2img_prompt');
  recalculatePromptTokens('txt2img_neg_prompt');
  return Array.from(arguments);
}

function recalculate_prompts_img2img(...args) {
  recalculatePromptTokens('img2img_prompt');
  recalculatePromptTokens('img2img_neg_prompt');
  return Array.from(arguments);
}

function recalculate_prompts_inpaint(...args) {
  recalculatePromptTokens('img2img_prompt');
  recalculatePromptTokens('img2img_neg_prompt');
  return Array.from(arguments);
}

function register_drag_drop() {
  const qs = gradioApp().getElementById('quicksettings');
  if (!qs) return;
  qs.addEventListener('dragover', (evt) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
  });
  qs.addEventListener('drop', (evt) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
    for (const f of evt.dataTransfer.files) {
      log('QuickSettingsDrop', f);
    }
  });
}

function sortUIElements() {
  // sort top-level tabs
  const currSelected = gradioApp()?.querySelector('.tab-nav > .selected')?.innerText;
  if (currSelected === tabSelected || !opts.ui_tab_reorder) return;
  tabSelected = currSelected;
  const tabs = gradioApp().getElementById('tabs')?.children[0];
  if (!tabs) return;
  let tabsOrder = opts.ui_tab_reorder?.split(',').map((el) => el.trim().toLowerCase()) || [];
  for (const el of Array.from(tabs.children)) {
    const elIndex = tabsOrder.indexOf(el.innerText.toLowerCase());
    if (elIndex > -1) el.style.order = elIndex - 50; // default is 0 so setting to negative values
  }
  // sort always-on scripts
  const find = (el, ordered) => {
    for (const i in ordered) {
      if (el.innerText.toLowerCase().startsWith(ordered[i])) return i;
    }
    return 99;
  };

  tabsOrder = opts.ui_scripts_reorder?.split(',').map((el) => el.trim().toLowerCase()) || [];

  const scriptsTxt = gradioApp().getElementById('scripts_alwayson_txt2img').children;
  for (const el of Array.from(scriptsTxt)) el.style.order = find(el, tabsOrder);

  const scriptsImg = gradioApp().getElementById('scripts_alwayson_img2img').children;
  for (const el of Array.from(scriptsImg)) el.style.order = find(el, tabsOrder);
  log('sortUIElements');
}

onAfterUiUpdate(async () => {
  let promptsInitialized = false;

  async function registerTextarea(id, id_counter, id_button) {
    const prompt = gradioApp().getElementById(id);
    if (!prompt) return;
    const counter = gradioApp().getElementById(id_counter);
    const localTextarea = gradioApp().querySelector(`#${id} > label > textarea`);
    if (counter.parentElement === prompt.parentElement) return;
    prompt.parentElement.insertBefore(counter, prompt);
    prompt.parentElement.style.position = 'relative';
    promptTokecountUpdateFuncs[id] = () => { update_token_counter(id_button); };
    localTextarea.addEventListener('input', promptTokecountUpdateFuncs[id]);
    if (!promptsInitialized) log('initPrompts');
    promptsInitialized = true;
  }

  // sortUIElements();
  registerTextarea('txt2img_prompt', 'txt2img_token_counter', 'txt2img_token_button');
  registerTextarea('txt2img_neg_prompt', 'txt2img_negative_token_counter', 'txt2img_negative_token_button');
  registerTextarea('img2img_prompt', 'img2img_token_counter', 'img2img_token_button');
  registerTextarea('img2img_neg_prompt', 'img2img_negative_token_counter', 'img2img_negative_token_button');
});

function update_txt2img_tokens(...args) {
  update_token_counter('txt2img_token_button');
  if (args.length === 2) return args[0];
  return args;
}

function update_img2img_tokens(...args) {
  update_token_counter('img2img_token_button');
  if (args.length === 2) return args[0];
  return args;
}

function getTranslation(...args) {
  return null;
}

function monitor_server_status() {
  document.open();
  document.write(`
    <html>
      <head><title>SD.Next</title></head>
      <body style="background: #222222; font-size: 1rem; font-family:monospace; margin-top:20%; color:lightgray; text-align:center">
        <h1>Waiting for server...</h1>
        <script>
          function monitor_server_status() {
            fetch('/sdapi/v1/progress')
              .then((res) => { !res?.ok ? setTimeout(monitor_server_status, 1000) : location.reload(); })
              .catch((e) => setTimeout(monitor_server_status, 1000))
          }
          window.onload = () => monitor_server_status();
        </script>
      </body>
    </html>
  `);
  document.close();
}

function restart_reload() {
  document.body.style = 'background: #222222; font-size: 1rem; font-family:monospace; margin-top:20%; color:lightgray; text-align:center';
  document.body.innerHTML = '<h1>Server shutdown in progress...</h1>';
  fetch('/sdapi/v1/progress')
    .then((res) => setTimeout(restart_reload, 1000))
    .catch((e) => setTimeout(monitor_server_status, 500));
  return [];
}

function updateInput(target) {
  const e = new Event('input', { bubbles: true });
  Object.defineProperty(e, 'target', { value: target });
  target.dispatchEvent(e);
}

let desiredCheckpointName = null;
function selectCheckpoint(name) {
  desiredCheckpointName = name;
  gradioApp().getElementById('change_checkpoint').click();
}

function currentImg2imgSourceResolution(_a, _b, scaleBy) {
  const img = gradioApp().querySelector('#mode_img2img > div[style="display: block;"] img');
  return img ? [img.naturalWidth, img.naturalHeight, scaleBy] : [0, 0, scaleBy];
}

function updateImg2imgResizeToTextAfterChangingImage() {
  setTimeout(() => gradioApp().getElementById('img2img_update_resize_to').click(), 500);
  return [];
}

function create_theme_element() {
  const el = document.createElement('img');
  el.id = 'theme-preview';
  el.className = 'theme-preview';
  el.onclick = () => { el.style.display = 'none'; };
  document.body.appendChild(el);
  return el;
}

function previewTheme() {
  let name = gradioApp().getElementById('setting_gradio_theme').querySelectorAll('input')?.[0].value || '';
  fetch('/file=html/themes.json').then((res) => {
    res.json().then((themes) => {
      const theme = themes.find((t) => t.id === name);
      if (theme) {
        window.open(theme.subdomain, '_blank');
      } else {
        const el = document.getElementById('theme-preview') || create_theme_element();
        el.style.display = el.style.display === 'block' ? 'none' : 'block';
        name = name.replace('/', '-');
        el.src = `/file=html/${name}.jpg`;
      }
    });
  });
}

async function browseFolder() {
  const f = await window.showDirectoryPicker();
  if (f && f.kind === 'directory') return f.name;
  return null;
}

async function reconnectUI() {
  const gallery = gradioApp().getElementById('txt2img_gallery');
  if (!gallery) return;
  const task_id = localStorage.getItem('task');
  const api_logo = Array.from(gradioApp().querySelectorAll('img')).filter((el) => el?.src?.endsWith('api-logo.svg'));
  if (api_logo.length > 0) api_logo[0].remove();
  clearInterval(start_check); // eslint-disable-line no-use-before-define
  if (task_id) {
    debug('task check:', task_id);
    requestProgress(task_id, null, gallery, null, null, true);
  }
  uiLoaded = true;

  const sd_model = gradioApp().getElementById('setting_sd_model_checkpoint');
  let loadingStarted = 0;
  let loadingMonitor = 0;

  const sd_model_callback = () => {
    const loading = sd_model.querySelector('.eta-bar');
    if (!loading) {
      loadingStarted = 0;
      clearInterval(loadingMonitor);
    } else if (loadingStarted === 0) {
      loadingStarted = Date.now();
      loadingMonitor = setInterval(() => {
        const elapsed = Date.now() - loadingStarted;
        if (elapsed > 3000 && loading) loading.style.display = 'none';
      }, 5000);
    }
  };
  const sd_model_observer = new MutationObserver(sd_model_callback);
  sd_model_observer.observe(sd_model, { attributes: true, childList: true, subtree: true });
  log('reconnectUI');
}

const start_check = setInterval(reconnectUI, 100);
