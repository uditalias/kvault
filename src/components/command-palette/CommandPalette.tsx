import { useEffect, useMemo, useCallback } from 'react';
import { Command } from 'cmdk';
import { getCommands, type Command as AppCommand } from './commands';
import { Kbd } from '../ui/Kbd';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callbacks: Parameters<typeof getCommands>[0];
}

export default function CommandPalette({ open, onOpenChange, callbacks }: CommandPaletteProps) {
  const commands = useMemo(() => (open ? getCommands(callbacks) : []), [open, callbacks]);

  const grouped = useMemo(() => {
    const map: Record<string, AppCommand[]> = {};
    for (const cmd of commands) {
      if (!map[cmd.category]) map[cmd.category] = [];
      map[cmd.category].push(cmd);
    }
    return map;
  }, [commands]);

  const handleSelect = useCallback(
    (commandId: string) => {
      const cmd = commands.find((c) => c.id === commandId);
      if (cmd && (!cmd.enabled || cmd.enabled())) {
        cmd.execute();
      }
    },
    [commands],
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const categoryOrder: string[] = ['Actions', 'Keys', 'Namespaces', 'Accounts'];

  return (
    <div className="cmdk-overlay" onClick={() => onOpenChange(false)}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <Command label="Command Palette">
          <Command.Input
            className="cmdk-input"
            placeholder="Type a command..."
            autoFocus
          />
          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">No results found.</Command.Empty>
            {categoryOrder.map((category) => {
              const items = grouped[category];
              if (!items || items.length === 0) return null;
              return (
                <Command.Group key={category} heading={category} className="cmdk-group">
                  {items.map((cmd) => {
                    const isDisabled = cmd.enabled ? !cmd.enabled() : false;
                    return (
                      <Command.Item
                        key={cmd.id}
                        value={`${cmd.label} ${cmd.category}`}
                        onSelect={() => handleSelect(cmd.id)}
                        disabled={isDisabled}
                        className="cmdk-item"
                      >
                        <span className="cmdk-item-label">{cmd.label}</span>
                        {cmd.shortcut && (
                          <span className="cmdk-item-shortcut"><Kbd keys={cmd.shortcut} /></span>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
