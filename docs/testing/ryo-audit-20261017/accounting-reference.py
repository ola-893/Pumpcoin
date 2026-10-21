"""Independent integer accounting oracle. Test inputs only; no provider or model data.
Run from repository root; writes deterministic cases beside this script.
Uses Python integer arithmetic, without importing Pump's implementation.
"""
import json, random
from pathlib import Path
rng=random.Random(20261017)
rows=[]
for i in range(24):
    cash=10_000_000_000
    quote=rng.randrange(10_000_000,300_000_001)
    notional=rng.randrange(10_000_000,500_000_001)
    slippage=rng.randrange(0,51)
    fee_bps=rng.randrange(0,31)
    exit_quote=quote*80//100  # known observed stop gap
    ceil=lambda a,b:(a+b-1)//b
    entry=ceil(quote*(10000+slippage),10000)
    quantity=notional*10**12//entry
    cost=quantity*entry//10**12
    entry_fee=ceil(notional*fee_bps,10000)
    after_entry=cash-cost-entry_fee
    exit_price=exit_quote*(10000-slippage)//10000
    proceeds=quantity*exit_price//10**12
    exit_fee=ceil(proceeds*fee_bps,10000)
    final_cash=after_entry+proceeds-exit_fee
    rows.append(dict(case=i,quote=str(quote),notional=str(notional),slippageBps=slippage,feeBps=fee_bps,exitQuote=str(exit_quote),expected={k:str(v) for k,v in dict(entry=entry,quantity=quantity,cashAfterEntry=after_entry,entryFee=entry_fee,exitPrice=exit_price,exitFee=exit_fee,totalFees=entry_fee+exit_fee,realized=final_cash-cash,finalCash=final_cash).items()}))
output=Path(__file__).with_name('accounting-cases.json')
output.write_text(json.dumps({'classification':'SYNTHETIC ACCOUNTING TESTS — NOT LIVE PERFORMANCE','seed':20261017,'cases':rows},indent=2)+'\n')
print(f'{len(rows)} deterministic independent reference cases written')
