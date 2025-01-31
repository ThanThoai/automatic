# We need this so Python doesn't complain about the unknown StableDiffusionProcessing-typehint at runtime
from __future__ import annotations
import re
import os
import csv
import json
from installer import log
from modules import paths


class Style():
    def __init__(self, name: str, prompt: str = "", negative_prompt: str = "", extra: str = "", filename: str = "", preview: str = ""):
        self.name = re.sub(r'[\t\r\n]', '', name).strip()
        self.prompt = prompt
        self.negative_prompt = negative_prompt
        self.extra = extra
        self.filename = filename
        self.preview = preview


def merge_prompts(style_prompt: str, prompt: str) -> str:
    if "{prompt}" in style_prompt:
        res = style_prompt.replace("{prompt}", prompt)
    else:
        original_prompt = prompt.strip()
        style_prompt = style_prompt.strip()
        parts = filter(None, (original_prompt, style_prompt))
        if original_prompt.endswith(","):
            res = " ".join(parts)
        else:
            res = ", ".join(parts)
    return res


def apply_styles_to_prompt(prompt, styles):
    for style in styles:
        prompt = merge_prompts(style, prompt)
    return prompt


class StyleDatabase:
    def __init__(self, opts):
        self.no_style = Style("None")
        self.styles = {}
        self.path = opts.styles_dir
        if os.path.isfile(opts.styles_dir) or opts.styles_dir.endswith(".csv"):
            legacy_file = opts.styles_dir
            self.load_csv(legacy_file)
            opts.styles_dir = os.path.join(paths.models_path, "styles")
            self.path = opts.styles_dir
            os.makedirs(opts.styles_dir, exist_ok=True)
            self.save_styles(opts.styles_dir, verbose=True)
            log.debug(f'Migrated styles: file={legacy_file} folder={opts.styles_dir}')
            self.reload()
        if not os.path.isdir(opts.styles_dir):
            opts.styles_dir = os.path.join(paths.models_path, "styles")
            self.path = opts.styles_dir
            os.makedirs(opts.styles_dir, exist_ok=True)

    def reload(self):
        self.styles.clear()
        def list_folder(folder):
            for filename in os.listdir(folder):
                fn = os.path.join(folder, filename)
                if os.path.isfile(fn) and fn.lower().endswith(".json"):
                    with open(fn, 'r', encoding='utf-8') as f:
                        try:
                            style = json.load(f)
                            fn = os.path.splitext(os.path.relpath(fn, self.path))[0]
                            self.styles[style["name"]] = Style(style["name"], style.get("prompt", ""), style.get("negative", ""), style.get("extra", ""), fn, style.get("preview", ""))
                        except Exception as e:
                            log.error(f'Failed to load style: file={fn} error={e}')
                elif os.path.isdir(fn) and not fn.startswith('.'):
                    list_folder(fn)

        list_folder(self.path)
        self.styles = dict(sorted(self.styles.items(), key=lambda style: style[1].filename))
        log.debug(f'Loaded styles: folder={self.path} items={len(self.styles.keys())}')

    def get_style_prompts(self, styles):
        return [self.styles.get(x, self.no_style).prompt for x in styles]

    def get_negative_style_prompts(self, styles):
        return [self.styles.get(x, self.no_style).negative_prompt for x in styles]

    def apply_styles_to_prompt(self, prompt, styles):
        return apply_styles_to_prompt(prompt, [self.styles.get(x, self.no_style).prompt for x in styles])

    def apply_negative_styles_to_prompt(self, prompt, styles):
        return apply_styles_to_prompt(prompt, [self.styles.get(x, self.no_style).negative_prompt for x in styles])

    def save_styles(self, path, verbose=False):
        for name in list(self.styles):
            style = {
                "name": name,
                "prompt": self.styles[name].prompt,
                "negative": self.styles[name].negative_prompt,
                "extra": "",
                "preview": "",
            }
            keepcharacters = (' ','.','_')
            fn = "".join(c for c in name if c.isalnum() or c in keepcharacters).rstrip()
            fn = os.path.join(path, fn + ".json")
            try:
                with open(fn, 'w', encoding='utf-8') as f:
                    json.dump(style, f, indent=2)
                    if verbose:
                        log.debug(f'Saved style: name={name} file={fn}')
            except Exception as e:
                log.error(f'Failed to save style: name={name} file={path} error={e}')
        count = len(list(self.styles))
        if count > 0:
            log.debug(f'Saved styles: {path} {count}')

    def load_csv(self, legacy_file):
        if not os.path.isfile(legacy_file):
            return
        with open(legacy_file, "r", encoding="utf-8-sig", newline='') as file:
            reader = csv.DictReader(file, skipinitialspace=True)
            for row in reader:
                try:
                    self.styles[row["name"]] = Style(row["name"], row["prompt"] if "prompt" in row else row["text"], row.get("negative_prompt", ""))
                except Exception:
                    log.error(f'Styles error: file={legacy_file} row={row}')
            log.debug(f'Loaded legacy styles: file={legacy_file} items={len(self.styles.keys())}')

    """
    def save_csv(self, path: str) -> None:
        import tempfile
        basedir = os.path.dirname(path)
        if basedir is not None and len(basedir) > 0:
            os.makedirs(basedir, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(".csv")
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline='') as file:
            writer = csv.DictWriter(file, fieldnames=Style._fields)
            writer.writeheader()
            writer.writerows(style._asdict() for k, style in self.styles.items())
            log.debug(f'Saved legacy styles: {path} {len(self.styles.keys())}')
        shutil.move(temp_path, path)
    """
