#!/usr/bin/env python3
"""One-off codemod: map legacy Tailwind palette classes onto BizManager design tokens."""
import re, sys

MAP = [
  (r'bg-blue-600 (?:text-white )?', 'bg-brand-gradient '),  # handled below too
]
SIMPLE = {
  'text-gray-900':'text-ink-900','text-gray-800':'text-ink-800','text-gray-700':'text-ink-700','text-gray-600':'text-ink-600',
  'text-gray-500':'text-ink-500','text-gray-400':'text-ink-400','text-gray-300':'text-ink-300',
  'bg-gray-50':'bg-ink-50','bg-gray-100':'bg-ink-100','bg-gray-200':'bg-ink-200','bg-white':'bg-surface',
  'border-gray-100':'border-line','border-gray-200':'border-line','border-gray-300':'border-line-strong',
  'divide-gray-100':'divide-line','divide-gray-200':'divide-line','hover:bg-gray-50':'hover:bg-ink-50','hover:bg-gray-100':'hover:bg-ink-100',
  'hover:text-gray-900':'hover:text-ink-900','hover:text-gray-700':'hover:text-ink-700',
  'bg-blue-600':'bg-brand-600','hover:bg-blue-700':'hover:bg-brand-700','bg-blue-50':'bg-brand-50','text-blue-600':'text-brand-700','text-blue-700':'text-brand-700',
  'border-blue-200':'border-brand-200','border-blue-500':'border-brand-600','focus:ring-blue-500':'focus:ring-brand-600','focus:border-blue-500':'focus:border-brand-600',
  'ring-blue-500':'ring-brand-600','text-blue-800':'text-brand-800',
  'bg-red-50':'bg-danger-50','text-red-600':'text-danger-600','text-red-700':'text-danger-700','text-red-800':'text-danger-700','border-red-200':'border-danger-600/25','bg-red-600':'bg-danger-600','hover:bg-red-700':'hover:bg-danger-700',
  'bg-green-50':'bg-success-50','text-green-600':'text-success-600','text-green-700':'text-success-700','text-green-800':'text-success-700','border-green-200':'border-success-600/25',
  'bg-amber-50':'bg-warning-50','bg-yellow-50':'bg-warning-50','text-amber-700':'text-warning-700','text-amber-800':'text-warning-700','text-yellow-800':'text-warning-700','border-amber-200':'border-warning-600/25','border-yellow-200':'border-warning-600/25',
  'rounded-md':'rounded-control','rounded-lg':'rounded-card','rounded-xl':'rounded-hero',
}
def convert(s):
    # longest keys first so hover:/focus: variants win
    for k in sorted(SIMPLE, key=len, reverse=True):
        s = re.sub(r'(?<![\w:-])'+re.escape(k)+r'(?![\w-])', SIMPLE[k], s)
    return s
for p in sys.argv[1:]:
    t = open(p).read(); n = convert(t)
    if n != t: open(p,'w').write(n); print('restyled', p)
