package com.google.common.primitives;
// Minimal stub of Guava's Longs (only used by MurmurHash.invRShiftXor helpers, not by hash3_x64_128).
public final class Longs {
  public static byte[] toByteArray(long v){byte[] r=new byte[8];for(int i=7;i>=0;i--){r[i]=(byte)(v&0xff);v>>=8;}return r;}
  public static long fromByteArray(byte[] b){long v=0;for(int i=0;i<8;i++)v=(v<<8)|(b[i]&0xff);return v;}
}
