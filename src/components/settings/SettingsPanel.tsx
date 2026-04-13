import { useSettingsStore } from '../../stores/settingsStore';
import { Palette, Type, WrapText, Map, RefreshCw, Trash2 } from 'lucide-react';
import { Kbd } from '../ui/Kbd';
import { themes, getTheme } from '../../themes';
import { ScrollArea } from '../ui/ScrollArea';

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 rounded-full transition-colors shrink-0 cursor-pointer ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-surface)]'
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] duration-200 ${
          checked ? 'left-5' : 'left-1'
        }`}
      />
    </button>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="flex items-start gap-3 min-w-0">
        <Icon size={16} className="text-[var(--text-tertiary)] mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm text-[var(--text-primary)]">{label}</div>
          {description && (
            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{description}</div>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4">{children}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1 mt-6 first:mt-0">
      {title}
    </div>
  );
}

const darkThemes = themes.filter((t) => t.type === 'dark');
const lightThemes = themes.filter((t) => t.type === 'light');

export function SettingsPanel() {
  const theme = useSettingsStore((s) => s.theme);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const editorWordWrap = useSettingsStore((s) => s.editorWordWrap);
  const editorMinimap = useSettingsStore((s) => s.editorMinimap);
  const autoSyncOnOpen = useSettingsStore((s) => s.autoSyncOnOpen);
  const confirmDelete = useSettingsStore((s) => s.confirmDelete);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const setEditorWordWrap = useSettingsStore((s) => s.setEditorWordWrap);
  const setEditorMinimap = useSettingsStore((s) => s.setEditorMinimap);
  const setAutoSyncOnOpen = useSettingsStore((s) => s.setAutoSyncOnOpen);
  const setConfirmDelete = useSettingsStore((s) => s.setConfirmDelete);

  const currentTheme = getTheme(theme);

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-6">Settings</h2>

        {/* Appearance */}
        <SectionHeader title="Appearance" />
        <div className="border-b border-[var(--border)] pb-2">
          <SettingRow
            icon={Palette}
            label="Color Theme"
            description={`${currentTheme.name} (${currentTheme.type})`}
          >
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs rounded-md px-2.5 py-1.5 outline-none cursor-pointer min-w-[160px]"
            >
              <optgroup label="Dark">
                {darkThemes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Light">
                {lightThemes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </SettingRow>
        </div>

        {/* Editor */}
        <SectionHeader title="Editor" />
        <div className="border-b border-[var(--border)] pb-2">
          <SettingRow
            icon={Type}
            label="Font Size"
            description={`${editorFontSize}px`}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={24}
                step={1}
                value={editorFontSize}
                onChange={(e) => setEditorFontSize(Number(e.target.value))}
                className="w-24 accent-[var(--accent)]"
              />
              <span className="text-xs text-[var(--text-secondary)] w-8 text-right font-mono">
                {editorFontSize}
              </span>
            </div>
          </SettingRow>

          <SettingRow
            icon={WrapText}
            label="Word Wrap"
            description="Wrap long lines in the editor"
          >
            <Toggle
              checked={editorWordWrap === 'on'}
              onChange={(v) => setEditorWordWrap(v ? 'on' : 'off')}
            />
          </SettingRow>

          <SettingRow
            icon={Map}
            label="Minimap"
            description="Show code minimap in the editor"
          >
            <Toggle
              checked={editorMinimap}
              onChange={setEditorMinimap}
            />
          </SettingRow>
        </div>

        {/* Sync */}
        <SectionHeader title="Sync" />
        <div className="border-b border-[var(--border)] pb-2">
          <SettingRow
            icon={RefreshCw}
            label="Auto-sync on Open"
            description="Automatically sync when opening a namespace"
          >
            <Toggle
              checked={autoSyncOnOpen}
              onChange={setAutoSyncOnOpen}
            />
          </SettingRow>
        </div>

        {/* General */}
        <SectionHeader title="General" />
        <div className="pb-2">
          <SettingRow
            icon={Trash2}
            label="Confirm on Delete"
            description="Show confirmation dialog before deleting keys"
          >
            <Toggle
              checked={confirmDelete}
              onChange={setConfirmDelete}
            />
          </SettingRow>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="mt-8 text-center text-[11px] text-[var(--text-tertiary)]">
          Press <Kbd keys={['⌘', ',']} /> to toggle settings
        </div>
      </div>
    </ScrollArea>
  );
}
