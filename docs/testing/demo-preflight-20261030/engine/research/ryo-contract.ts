/** Names observed on the authenticated server or documented on the official program site.
 * Advertisement is still required before every invocation. No execution tools are allowed. */
export const RYO_READ_TOOLS=['market_overview','scan_market','analyze_token','deep_analysis','compare_tokens','check_safety','supported_tokens','monitor_market_sentiment_shift'];
export const MCP_VERSIONS=['2025-06-18','2025-03-26','2024-11-05'];
export type Tool={name:string;description?:string;inputSchema:Record<string,unknown>};
export function validateArguments(value:unknown,schema:Record<string,any>,depth=0):void {
  if(depth>8)throw new Error('Tool argument schema exceeds the supported depth.');
  const supported=['type','properties','required','additionalProperties','items','enum','description','title','default','minimum','maximum','minItems','maxItems','minLength','maxLength','pattern','$schema'];
  if(Object.keys(schema).some(k=>!supported.includes(k)))throw new Error('Review unsupported provider schema constraints before calling this tool.');
  const matches=(type:string)=>type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?!!value&&typeof value==='object'&&!Array.isArray(value):type==='integer'?Number.isSafeInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===type;
  if(schema.type&&!(Array.isArray(schema.type)?schema.type:[schema.type]).some(matches))throw new Error('Configured tool argument has the wrong type.');
  if(schema.enum&&!schema.enum.includes(value))throw new Error('Configured tool argument is outside the advertised enum.');
  if(typeof value==='number'&&(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum))throw new Error('Configured tool argument exceeds advertised numeric bounds.');
  if(typeof value==='string'&&(schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength||schema.pattern&&!new RegExp(schema.pattern).test(value)))throw new Error('Configured tool argument violates advertised text constraints.');
  if(Array.isArray(value)){if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)throw new Error('Configured tool argument exceeds array bounds.');if(schema.items)for(const item of value)validateArguments(item,schema.items,depth+1);}
  else if(value&&typeof value==='object'){
    const args=value as Record<string,unknown>;for(const key of schema.required??[])if(!(key in args))throw new Error('Configured tool arguments omit a required field.');
    for(const [key,v] of Object.entries(args)){const child=schema.properties?.[key];if(child)validateArguments(v,child,depth+1);else if(schema.additionalProperties===false)throw new Error('Unexpected configured tool argument.');else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')validateArguments(v,schema.additionalProperties,depth+1);}
  }
}
export function validateTool(name:string,args:Record<string,unknown>,catalog:Tool[]) {
  const tool=catalog.find(t=>t.name===name);if(!tool||!RYO_READ_TOOLS.includes(name))throw new Error('Required read-only RYO tool is not advertised.');
  validateArguments(args,tool.inputSchema);
}
