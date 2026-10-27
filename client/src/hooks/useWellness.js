import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fitnessApi, messageOf } from '../services/api';
import { readDemo } from '../services/demo';
export default function useWellness() {
  const { demo } = useApp(); const [plan,setPlan]=useState(null), [progress,setProgress]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState('');
  const reload=useCallback(async()=>{ setLoading(true);setError(''); if(demo){const data=readDemo();setPlan(data.mealPlan?data:null);setProgress(data.progress);setLoading(false);return;}
    const results=await Promise.allSettled([fitnessApi.plan(),fitnessApi.progress()]);
    if(results[0].status==='fulfilled')setPlan(results[0].value.data);else if(results[0].reason.response?.status===404)setPlan(null);else setError(messageOf(results[0].reason));
    if(results[1].status==='fulfilled')setProgress(results[1].value.data.progress);else setError(messageOf(results[1].reason));setLoading(false);
  },[demo]);useEffect(()=>{reload();},[reload]);return{plan,progress,loading,error,reload,setPlan};
}
