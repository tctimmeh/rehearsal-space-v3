"""Offline pitch reference: big windows, non-causal, no realtime constraints."""
import numpy as np, wave

def load(path):
    w=wave.open(path); n=w.getnframes(); sr=w.getframerate()
    x=np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64)/32768.0
    return x, sr

def yin(frame, sr, fmin=60.0, fmax=900.0):
    N=len(frame); tmax=int(sr/fmin); tmin=max(2,int(sr/fmax))
    frame=frame-frame.mean()
    if np.sqrt((frame**2).mean())<1e-4: return None, 0.0
    size=1<<int(np.ceil(np.log2(2*N)))
    F=np.fft.rfft(frame, size); ac=np.fft.irfft(F*np.conj(F))[:tmax+1]
    power=np.concatenate(([0.0], np.cumsum(frame**2)))
    t=np.arange(tmax+1)
    d=(power[N-t]-power[0])+(power[N]-power[t])-2*ac
    run=np.cumsum(d); run[run<=0]=np.inf
    cm=np.ones(tmax+1); cm[1:]=d[1:]*t[1:]/run[1:]
    seg=cm[tmin:tmax]
    below=np.where(seg<0.15)[0]
    best=None
    for i in below:
        j=i+tmin
        if cm[j]<=cm[j-1] and cm[j]<=cm[j+1]: best=j; break
    if best is None:
        best=int(np.argmin(seg))+tmin
        if cm[best]>0.6: return None, float(1-cm[best])
    a,b,c=cm[best-1],cm[best],cm[best+1]
    denom=(a-2*b+c)
    shift=0.5*(a-c)/denom if denom!=0 else 0.0
    return sr/(best+shift), float(1-b)

def curve(path, win=0.20, hop=0.025):
    x,sr=load(path); W=int(win*sr); H=int(hop*sr)
    return [(((i+W/2)/sr), *yin(x[i:i+W], sr), float(np.sqrt((x[i:i+W]**2).mean())))
            for i in range(0, len(x)-W, H)]
