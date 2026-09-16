from pathlib import Path

path = Path('apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts')
text = path.read_text(encoding='utf-8')
old = '''  const voiceLanguage = () =>\n    voice?.getPreferences().language ??\n    normalizeAssistantVoiceLanguage(options.document.documentElement.lang);\n'''
new = '''  const voiceLanguage = () =>\n    voice?.getPreferences().language ??\n    normalizeAssistantVoiceLanguage(options.document.documentElement.lang);\n\n  const presentationLanguage = () =>\n    normalizeAssistantVoiceLanguage(options.document.documentElement.lang);\n'''
if text.count(old) != 1:
    raise SystemExit(f'voice language anchor mismatch: {text.count(old)}')
text = text.replace(old, new, 1)
old = '      language: voiceLanguage(),\n'
new = '      language: presentationLanguage(),\n'
if text.count(old) != 1:
    raise SystemExit(f'place action language anchor mismatch: {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
