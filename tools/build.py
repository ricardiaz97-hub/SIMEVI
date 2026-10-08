"""Une src/*.js en app.js y arma una versión de un solo archivo para la demo."""
import base64, glob, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(root, 'src', '*.js'))))
open(os.path.join(root, 'app.js'), 'w', encoding='utf-8').write(js)
if '--demo' in sys.argv:
    out = sys.argv[sys.argv.index('--demo') + 1]
    css = open(os.path.join(root, 'app.css'), encoding='utf-8').read()
    html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
    icons = open(os.path.join(root, 'icons.svg'), encoding='utf-8').read()
    def uri(p):
        mime = 'image/webp' if p.endswith('.webp') else 'image/png'
        return f'data:{mime};base64,' + base64.b64encode(open(os.path.join(root, p), 'rb').read()).decode()
    imgs = {p: uri(p) for p in ['img/sv.webp', 'img/logo-full.webp', 'img/icon-192.png']}
    for k, v in imgs.items():
        js = js.replace(k, v); html = html.replace(k, v)
    html = html.replace('<link rel="stylesheet" href="app.css">', '<style>\n' + css + '\n</style>')
    html = re.sub(r'<link rel="manifest"[^>]*>\n', '', html)
    html = html.replace('<!--ICONS-->', icons)
    html = html.replace('<script src="app.js"></script>', '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>')
    if '--artifact' in sys.argv:  # el visor pone su propio <!doctype>, <head> y <body>
        html = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', html, flags=re.I)
        html = re.sub(r'<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*', '', html)
        html = html.replace('</head>\n<body>', '').replace('</body>\n</html>', '')
        html = '<style>html{background:#060B10}</style>\n' + html
    open(out, 'w', encoding='utf-8').write(html)
    print('demo', out, os.path.getsize(out))
print('app.js', len(js))
