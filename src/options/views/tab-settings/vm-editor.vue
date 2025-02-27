<template>
  <section>
    <h3 v-text="i18n('labelEditor')"></h3>
    <div class="mr-1c flex center-items">
      <span v-text="i18n('labelTheme')"/>
      <select v-model="theme" :disabled="busy" :title="css">
        <option :value="DEFAULT" v-text="i18n('labelRunAtDefault')"/>
        <option value="" v-text="i18n('labelBadgeNone')"/>
        <option v-for="name in themes" :key="name" v-text="name"/>
      </select>
      <a :href="ghURL" target="_blank">&nearr;</a>
      <p v-text="error"/>
    </div>
    <p v-html="i18n('descEditorOptions')" class="my-1"/>
    <setting-text name="editor" ref="editor" :json="true" :has-reset="true" @save="onSave">
      <button v-text="i18n('buttonShowEditorState')" @click="toggleStateHint"/>
    </setting-text>
    <pre v-text="hint" class="monospace-font dim-hint" />
  </section>
</template>

<script>
import options from '@/common/options';
import hookSetting from '@/common/hook-setting';
import { showMessage } from '@/common/ui';
import SettingText from '@/common/ui/setting-text';

const keyThemeCSS = 'editorTheme';
const keyThemeNAME = 'editorThemeName';
const THEMES = process.env.CODEMIRROR_THEMES;
const gh = 'github.com';
const ghREPO = 'codemirror/CodeMirror';
const ghBRANCH = 'master';
const ghPATH = 'theme';
const ghURL = `https://${gh}/${ghREPO}/tree/${ghBRANCH}/${ghPATH}`;
const DEFAULT = 'default';
const previewLINES = 20;
const previewLENGTH = 100;
const makeTextPreview = css => (
  css
    ? css.split('\n', previewLINES + 1).map((s, i) => (
      i === previewLINES && (
        '...'
      ) || s.length > previewLENGTH && (
        `${s.slice(0, previewLENGTH)}...`
      ) || s
    )).join('\n')
    : null
);

export default {
  data() {
    return {
      hint: null,
      busy: false,
      error: null,
      css: null,
      theme: null,
      themes: THEMES,
      DEFAULT,
      ghURL,
    };
  },
  components: {
    SettingText,
  },
  beforeDestroy() {
    this.revokers.forEach(revoke => revoke());
    this.revokers = null;
  },
  async mounted() {
    this.$refs.editor.$el.addEventListener('dblclick', this.toggleBoolean);
    if (!this.revokers) {
      this.css = makeTextPreview(options.get(keyThemeCSS));
      this.revokers = [
        hookSetting(keyThemeNAME, val => { this.theme = val ?? DEFAULT; }),
      ];
      await options.ready; // Waiting for hookSetting to set the value before watching for changes
      this.$watch('theme', async val => {
        const url = val && val !== DEFAULT
          && `https://raw.githubusercontent.com/${ghREPO}/${ghBRANCH}/${ghPATH}/${val}.css`;
        const css = url && await this.fetch(url);
        options.set(keyThemeNAME, !url || css ? val : DEFAULT);
        options.set(keyThemeCSS, css || '');
        this.css = makeTextPreview(css);
      });
    }
  },
  methods: {
    async fetch(url, method = 'text') {
      const el = document.activeElement;
      this.busy = true;
      try {
        const res = await (await fetch(url))[method]();
        this.error = null;
        return res;
      } catch (e) {
        this.error = e.message || e.code || `${e}`;
      } finally {
        this.busy = false;
        this.$nextTick(() => el?.focus());
      }
    },
    onSave() {
      showMessage({ text: this.$refs.editor.error || this.i18n('msgSavedEditorOptions') });
    },
    toggleBoolean(event) {
      const el = /** @type {HTMLTextAreaElement} */ event.target;
      const { selectionStart: start, selectionEnd: end, value } = el;
      const toggled = { false: 'true', true: 'false' }[value.slice(start, end)];
      // FF can't run execCommand on textarea, https://bugzil.la/1220696#c24
      if (toggled && !document.execCommand('insertText', false, toggled)) {
        el.value = value.slice(0, start) + toggled + value.slice(end);
        el.setSelectionRange(start + toggled.length, start + toggled.length);
        el.dispatchEvent(new Event('input'));
        el.onblur = () => el.dispatchEvent(new Event('change'));
      }
    },
    async toggleStateHint() {
      if (this.hint) {
        this.hint = null;
        return;
      }
      const HIDE_OPTS = [
        // we activate only one mode: js
        'mode',
        // duh
        'value',
        // these accept only a function
        'configureMouse',
        'lineNumberFormatter',
        'specialCharPlaceholder',
      ];
      const opts = {};
      Object.entries({
        ...(await import('codemirror')).defaults,
        ...(await import('@/common/ui/code')).default.data().cmDefaults,
        ...options.get('editor'),
      })
      // sort by keys alphabetically to make it more readable
      .sort(([a], [b]) => (a < b ? -1 : a > b))
      .filter(([key, val]) => !HIDE_OPTS.includes(key) && typeof val !== 'function')
      .forEach(([key, val]) => { opts[key] = val; });
      this.hint = JSON.stringify(opts, null, '  ');
      setTimeout(() => {
        if (this.$el.getBoundingClientRect().bottom > window.innerHeight) {
          this.$el.scrollIntoView({ behavior: 'smooth' });
        }
      });
    },
  },
};
</script>

<style>
  .dim-hint {
    font-size: .85rem;
    color: var(--fill-8);
  }
</style>
