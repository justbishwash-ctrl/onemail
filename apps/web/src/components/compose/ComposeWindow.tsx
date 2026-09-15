import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  X, Minus, Maximize2, Minimize2, Paperclip, Send,
  Bold, Italic, UnderlineIcon, List, ListOrdered
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useStore } from '../../store';
import { messagesApi, draftsApi } from '../../services/api';
import { extractEmailAddress } from '../../utils/format';
import type { ParsedThread } from '../../types/gmail';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

interface ComposeWindowProps {
  mode: ComposeMode;
  context: ParsedThread | null;
  onClose: () => void;
}

export default function ComposeWindow({ mode, context, onClose }: ComposeWindowProps) {
  const { me, addToast } = useStore((s) => ({ me: s.me, addToast: s.addToast }));
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [to, setTo] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [bcc, setBcc] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState('');
  const [subject, setSubject] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ filename: string; mimeType: string; data: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastMessage = context?.messages[context.messages.length - 1];

  // Pre-fill based on mode
  useEffect(() => {
    if (!context || !lastMessage) return;

    if (mode === 'reply') {
      setTo([extractEmailAddress(lastMessage.from)]);
      setSubject(
        lastMessage.subject.startsWith('Re:')
          ? lastMessage.subject
          : `Re: ${lastMessage.subject}`
      );
    } else if (mode === 'replyAll') {
      setTo([
        extractEmailAddress(lastMessage.from),
        ...lastMessage.to.map(extractEmailAddress),
      ].filter((e) => e !== me?.activeAccount.email));
      setCc(lastMessage.cc.map(extractEmailAddress));
      setShowCc(lastMessage.cc.length > 0);
      setSubject(
        lastMessage.subject.startsWith('Re:')
          ? lastMessage.subject
          : `Re: ${lastMessage.subject}`
      );
    } else if (mode === 'forward') {
      setSubject(
        lastMessage.subject.startsWith('Fwd:')
          ? lastMessage.subject
          : `Fwd: ${lastMessage.subject}`
      );
    }
  }, [mode, context, lastMessage, me?.activeAccount.email]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your message...' }),
    ],
    content: mode === 'forward' && lastMessage
      ? `<br/><br/><p>---------- Forwarded message ----------</p>${lastMessage.htmlBody ?? `<p>${lastMessage.plainBody ?? ''}</p>`}`
      : '',
    editorProps: {
      attributes: {
        class: 'min-h-[160px] outline-none text-sm text-foreground',
      },
    },
  });

  // Auto-save draft
  const saveDraft = useCallback(async () => {
    if (!editor || to.length === 0) return;
    const html = editor.getHTML();
    if (!html || html === '<p></p>') return;

    setSavingDraft(true);
    try {
      const data = {
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        htmlBody: html,
        inReplyTo: lastMessage?.messageId ?? undefined,
        references: lastMessage?.references ?? undefined,
        threadId: context?.id,
      };

      if (draftId) {
        await draftsApi.update(draftId, data);
      } else {
        const draft = await draftsApi.create(data);
        setDraftId(draft.id);
      }
    } catch {
      // silently ignore draft save errors
    } finally {
      setSavingDraft(false);
    }
  }, [editor, to, cc, bcc, subject, draftId, lastMessage, context]);

  // Debounced draft save every 30s
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(saveDraft, 30_000);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [saveDraft]);

  async function handleSend() {
    if (!editor || to.length === 0 || !subject.trim()) {
      addToast('To and subject are required', 'error');
      return;
    }

    setSending(true);
    try {
      const html = editor.getHTML();
      const sig = me?.preferences.signature;
      const htmlBody = sig ? `${html}<br/><br/>--<br/>${sig}` : html;

      await messagesApi.send({
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        htmlBody,
        attachments: attachments.length ? attachments : undefined,
        inReplyTo: lastMessage?.messageId ?? undefined,
        references: lastMessage?.references ?? undefined,
        threadId: context?.id,
        trackingEnabled: me?.preferences.trackingEnabled,
      });

      // Delete draft after successful send
      if (draftId) {
        await draftsApi.delete(draftId).catch(() => {});
      }

      addToast('Message sent', 'success');
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  function handleAddEmail(
    input: string,
    list: string[],
    setList: (l: string[]) => void,
    setInput: (s: string) => void
  ) {
    const email = input.trim().replace(/[<>]/g, '');
    if (email && email.includes('@') && !list.includes(email)) {
      setList([...list, email]);
    }
    setInput('');
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1];
        setAttachments((prev) => [
          ...prev,
          { filename: file.name, mimeType: file.type, data: b64 },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  async function handleDiscard() {
    if (draftId) {
      await draftsApi.delete(draftId).catch(() => {});
    }
    onClose();
  }

  const windowClass = cn(
    'fixed bg-card border border-border shadow-2xl flex flex-col z-50',
    fullscreen
      ? 'inset-4 rounded-xl'
      : minimized
      ? 'bottom-0 right-6 w-80 rounded-t-xl'
      : 'bottom-0 right-6 w-[560px] h-[520px] rounded-t-xl'
  );

  return (
    <div className={windowClass}>
      {/* Window header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 rounded-t-xl cursor-pointer"
        onClick={() => minimized && setMinimized(false)}
      >
        <span className="text-sm font-medium text-foreground">
          {mode === 'new' ? 'New message' : mode === 'reply' ? 'Reply' : mode === 'replyAll' ? 'Reply all' : 'Forward'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized((m) => !m); }}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setFullscreen((f) => !f); }}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDiscard(); }}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Fields */}
          <div className="border-b border-border">
            <RecipientField
              label="To"
              emails={to}
              input={toInput}
              onInputChange={setToInput}
              onAdd={(email) => setTo([...to, email])}
              onRemove={(email) => setTo(to.filter((e) => e !== email))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                  e.preventDefault();
                  handleAddEmail(toInput, to, setTo, setToInput);
                }
              }}
              actions={
                <div className="flex gap-1.5 text-xs text-muted-foreground">
                  {!showCc && <button className="hover:text-foreground" onClick={() => setShowCc(true)}>Cc</button>}
                  {!showBcc && <button className="hover:text-foreground" onClick={() => setShowBcc(true)}>Bcc</button>}
                </div>
              }
            />
            {showCc && (
              <RecipientField
                label="Cc"
                emails={cc}
                input={ccInput}
                onInputChange={setCcInput}
                onAdd={(email) => setCc([...cc, email])}
                onRemove={(email) => setCc(cc.filter((e) => e !== email))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                    e.preventDefault();
                    handleAddEmail(ccInput, cc, setCc, setCcInput);
                  }
                }}
              />
            )}
            {showBcc && (
              <RecipientField
                label="Bcc"
                emails={bcc}
                input={bccInput}
                onInputChange={setBccInput}
                onAdd={(email) => setBcc([...bcc, email])}
                onRemove={(email) => setBcc(bcc.filter((e) => e !== email))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                    e.preventDefault();
                    handleAddEmail(bccInput, bcc, setBcc, setBccInput);
                  }
                }}
              />
            )}
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-transparent outline-none border-b border-border placeholder:text-muted-foreground"
            />
          </div>

          {/* Editor toolbar */}
          <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border">
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')}>
              <Bold className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')}>
              <Italic className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')}>
              <UnderlineIcon className="w-3.5 h-3.5" />
            </ToolbarButton>
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')}>
              <List className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')}>
              <ListOrdered className="w-3.5 h-3.5" />
            </ToolbarButton>
          </div>

          {/* Editor body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <EditorContent editor={editor} />
          </div>

          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 border-t border-border pt-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-lg text-xs">
                  <Paperclip className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate max-w-[120px]">{att.filename}</span>
                  <button
                    onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? 'Sending...' : 'Send'}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileAttach} />
            </div>
            <div className="flex items-center gap-2">
              {savingDraft && <span className="text-xs text-muted-foreground">Saving...</span>}
              <button
                onClick={handleDiscard}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-1.5 rounded transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

interface RecipientFieldProps {
  label: string;
  emails: string[];
  input: string;
  onInputChange: (v: string) => void;
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  actions?: React.ReactNode;
}

function RecipientField({ label, emails, input, onInputChange, onRemove, onKeyDown, actions }: RecipientFieldProps) {
  return (
    <div className="flex items-center flex-wrap gap-1.5 px-4 py-2 border-b border-border min-h-[40px]">
      <span className="text-xs text-muted-foreground shrink-0 w-7">{label}</span>
      {emails.map((email) => (
        <span key={email} className="flex items-center gap-1 bg-muted text-xs px-2 py-0.5 rounded-full">
          {email}
          <button onClick={() => onRemove(email)} className="text-muted-foreground hover:text-foreground">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (input.includes('@')) {
            onAdd(input.trim());
            onInputChange('');
          }
        }}
        placeholder={emails.length === 0 ? 'Add recipients' : ''}
        className="flex-1 min-w-[120px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
      />
      {actions}
    </div>
  );
}
