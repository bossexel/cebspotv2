import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { circleService, type CircleSharingState } from '../services/circleService';

export function CirclePrivacyControls({ circleId, onSharingChanged, onEnabled, onLeft }: {
  circleId: string; onSharingChanged: (state: CircleSharingState) => void; onEnabled: () => void; onLeft: () => void;
}) {
  const { user } = useAuth();
  const { appColors } = useTheme();
  const [sharing,setSharing]=useState<CircleSharingState>({enabled:false,generation:null});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const callbacks=useRef({onSharingChanged,onEnabled,onLeft});callbacks.current={onSharingChanged,onEnabled,onLeft};
  useEffect(()=>{
    let active=true;
    setSharing({enabled:false,generation:null});setBusy(false);setError(null);
    callbacks.current.onSharingChanged({enabled:false,generation:null});
    if(user?.id)void circleService.getLocationSharing(user.id).then(state=>{
      if(active){setSharing(state);callbacks.current.onSharingChanged(state)}
    }).catch(()=>{if(active)setError('Sharing status unavailable. Location will stay private until confirmed.');});
    return ()=>{active=false;callbacks.current.onSharingChanged({enabled:false,generation:null})};
  },[circleId,user?.id]);
  async function toggle(){
    if(busy)return;setBusy(true);setError(null);
    try{
      const state=await circleService.setLocationSharing(!sharing.enabled);
      setSharing(state);callbacks.current.onSharingChanged(state);
      if(state.enabled)callbacks.current.onEnabled();
    }catch{setError('Sharing choice could not be saved. Retry.');}
    finally{setBusy(false)}
  }
  function leave(){
    Alert.alert('Leave this circle?','Location sharing stops in all your circles. If you own this circle, ownership passes to a remaining member. Its old invitation code expires.',[
      {text:'Stay',style:'cancel'},
      {text:'Leave circle',style:'destructive',onPress:async()=>{
        if(busy)return;setBusy(true);setError(null);
        try{await circleService.leaveCircle(circleId);callbacks.current.onSharingChanged({enabled:false,generation:null});callbacks.current.onLeft();}
        catch{setError('Could not leave this circle. Retry.');setBusy(false)}
      }},
    ]);
  }
  return <View style={{padding:16,gap:12,backgroundColor:appColors.surfaceLow,borderRadius:16}}>
    <Text style={{color:appColors.onSurface}}>{sharing.enabled?'Location sharing is on for your circles.':'Location sharing is off. Your device position stays on this screen.'}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void toggle()} style={{minHeight:48,justifyContent:'center'}}>
      <Text style={{color:appColors.primary}}>{busy?'Saving…':sharing.enabled?'Stop location sharing':'Share location with my circles'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={leave} style={{minHeight:48,justifyContent:'center'}}>
      <Text style={{color:appColors.danger}}>Leave circle</Text>
    </Pressable>
    {error && <Text accessibilityRole="alert" style={{color:appColors.danger}}>{error}</Text>}
  </View>;
}
