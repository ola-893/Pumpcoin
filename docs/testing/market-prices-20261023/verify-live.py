"""Independent offline calculation over the final authentic source preflight."""
import json
import sys
from decimal import Decimal, getcontext
from datetime import datetime
from pathlib import Path
getcontext().prec = 80
root = Path(__file__).resolve().parent
e = json.loads((root / (sys.argv[1] if len(sys.argv)>1 else 'live-eth-depth-preflight.json')).read_text())['evidence']
c = next(r for r in e['raw'] if r['kind'] == 'coinbase-exchange')
assert c['url'] == 'https://api.exchange.coinbase.com/products/ETH-USD/book?level=2'
assert c['status'] == 200
b = json.loads(c['body'])
assert b['auction_mode'] is False
D = Decimal
mid = int((D(b['bids'][0][0]) + D(b['asks'][0][0])) * D(500000))
mid_usd = D(mid) / 10**6
lo, hi = mid_usd * D('0.999'), mid_usd * D('1.001')
def depth(rows):
    return int(sum((D(price) * D(size) for price, size, count in rows if lo <= D(price) <= hi), D(0)) * 10**6)
measured = min(depth(b['bids']), depth(b['asks']))
m = e['markets'][0]
assert str(mid) == m['price']
assert str(measured) == m['liquidity']
now = datetime.fromisoformat(e['capturedAt'].replace('Z', '+00:00'))
fresh = [p for p in e['posts'] if 0 <= (now - datetime.fromisoformat(p['publishedAt'].replace('Z', '+00:00'))).total_seconds() <= 3600]
print(json.dumps({'scope': 'Independent Decimal calculation of authentic unsigned preflight; no model inference or trade', 'capturedAt': e['capturedAt'], 'providerTime': b['time'], 'instrument': m['id'], 'midpointUsd': str(mid_usd), 'minimumTwoSidedDepthWithin10bpsUsd': str(D(measured)/10**6), 'midpointMatches': True, 'depthMatches': True, 'newsItems': len(e['posts']), 'freshWithinOneHour': len(fresh), 'ryoPricingAvailable': next(s['available'] for s in e['sources'] if s['source']=='ryo')}, indent=2))
