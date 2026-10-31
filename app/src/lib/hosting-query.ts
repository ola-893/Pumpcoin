import {useQuery} from '@tanstack/react-query';
import {registrationSession} from './agent-registration';
export const useHosting=()=>useQuery({queryKey:['hosting-capabilities-v1'],queryFn:({signal})=>registrationSession(signal),staleTime:Infinity,retry:1});
