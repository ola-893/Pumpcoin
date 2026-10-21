import { useQuery } from '@tanstack/react-query';
import { registrationRequest, registrationSession } from './agent-registration';
import type { ResearchView } from '../../../research/types';
export async function researchRequest(route:string,body:unknown,signal?:AbortSignal){const s=await registrationSession(signal);return registrationRequest(s.token,route,body,signal);}
export function useResearch(id:string){return useQuery<ResearchView>({queryKey:['agent-research-v1',id],queryFn:async({signal})=>(await researchRequest('/research-state',{id},signal)).research,staleTime:15000,refetchInterval:30000,retry:false});}
