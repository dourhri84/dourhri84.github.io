// Reference implementation for CassLab technical validation.
//
// Token computation uses Apache Cassandra's OWN MurmurHash.java (branch cassandra-5.0,
// compiled unmodified) plus the normalisation of Murmur3Partitioner.getToken().
// Replica placement and consistency checks are line-by-line transcriptions of:
//   locator/SimpleStrategy.calculateNaturalReplicas
//   locator/NetworkTopologyStrategy.calculateNaturalReplicas (+ DatacenterEndpoints)
//   db/ConsistencyLevel.blockFor / quorumFor / localQuorumFor
//   locator/ReplicaPlans.assureSufficientLiveReplicas
//
// Protocol (stdin, one command per line; stdout one answer per line):
//   TOKEN <hex bytes>                        -> <signed long token>
//   RESET                                    -> (clears topology)
//   NODE <id> <dc> <rack> <UP|DOWN> <t1,t2,..>
//   STRATEGY SIMPLE <rf> | STRATEGY NTS dc1:3,dc2:3
//   REPLICAS <token>                         -> id1,id2,... (insertion order; first = primary)
//   CL <token> <LEVEL> <localDc>             -> <blockFor> <OK|UNAVAILABLE>
import java.io.*;
import java.nio.ByteBuffer;
import java.util.*;
import org.apache.cassandra.utils.MurmurHash;

public class CassandraReference {
    static final class Node { String id, dc, rack; boolean up; }
    static final TreeMap<Long, Node> ring = new TreeMap<>();          // sortedTokens + getEndpoint
    static final LinkedHashMap<String, Node> nodes = new LinkedHashMap<>();
    static boolean nts; static int simpleRf; static LinkedHashMap<String,Integer> dcRf = new LinkedHashMap<>();

    static long token(byte[] key) {
        if (key.length == 0) return Long.MIN_VALUE;                   // Murmur3Partitioner.MINIMUM
        long[] h = new long[2];
        MurmurHash.hash3_x64_128(ByteBuffer.wrap(key), 0, key.length, 0, h);
        return h[0] == Long.MIN_VALUE ? Long.MAX_VALUE : h[0];        // normalize()
    }

    // TokenMetadata.ringIterator(sortedTokens, start, false): first token >= start, then wrap.
    static List<Long> ringFrom(long t) {
        List<Long> out = new ArrayList<>(ring.tailMap(t, true).keySet());
        out.addAll(ring.headMap(t, false).keySet());
        return out;
    }

    static List<Node> replicas(long t) {
        List<Node> res = new ArrayList<>();
        if (!nts) {
            for (Long tk : ringFrom(t)) {
                if (res.size() >= simpleRf) break;
                Node ep = ring.get(tk);
                if (!res.contains(ep)) res.add(ep);
            }
            return res;
        }
        // NetworkTopologyStrategy (5.0)
        Set<String> seenRacks = new HashSet<>();
        Map<String, int[]> dcs = new HashMap<>();                    // dc -> {rfLeft, acceptableRackRepeats}
        int dcsToFill = 0;
        for (Map.Entry<String,Integer> en : dcRf.entrySet()) {
            String dc = en.getKey(); int rf = en.getValue();
            Set<String> racks = new HashSet<>(); int nodeCount = 0;
            for (Node n : nodes.values()) if (n.dc.equals(dc)) { nodeCount++; racks.add(n.rack); }
            if (rf <= 0 || nodeCount <= 0) continue;
            dcs.put(dc, new int[]{ Math.min(rf, nodeCount), rf - racks.size() });
            dcsToFill++;
        }
        for (Long tk : ringFrom(t)) {
            if (dcsToFill <= 0) break;
            Node ep = ring.get(tk);
            int[] d = dcs.get(ep.dc);
            if (d == null || d[0] == 0 || res.contains(ep)) continue;
            if (seenRacks.add(ep.dc + "/" + ep.rack)) { d[0]--; res.add(ep); if (d[0] == 0) dcsToFill--; continue; }
            if (d[1] <= 0) continue;
            res.add(ep); d[1]--; d[0]--; if (d[0] == 0) dcsToFill--;
        }
        return res;
    }

    static int totalRf() { if (!nts) return simpleRf; int s = 0; for (int v : dcRf.values()) s += v; return s; }
    static int quorumFor() { return totalRf() / 2 + 1; }
    static int localQuorumFor(String dc) { return nts ? dcRf.getOrDefault(dc, 0) / 2 + 1 : quorumFor(); }

    static int blockFor(String cl, String localDc) {
        switch (cl) {
            case "ONE": case "LOCAL_ONE": case "ANY": return 1;
            case "TWO": return 2; case "THREE": return 3;
            case "QUORUM": return quorumFor();
            case "ALL": return totalRf();
            case "LOCAL_QUORUM": return localQuorumFor(localDc);
            case "EACH_QUORUM": if (nts) { int n = 0; for (String dc : dcRf.keySet()) n += localQuorumFor(dc); return n; } return quorumFor();
        }
        throw new IllegalArgumentException(cl);
    }

    static boolean sufficient(List<Node> reps, String cl, String localDc) {
        int bf = blockFor(cl, localDc);
        List<Node> live = new ArrayList<>(); for (Node n : reps) if (n.up) live.add(n);
        switch (cl) {
            case "ANY": return true;
            case "LOCAL_ONE": case "LOCAL_QUORUM": {
                long l = live.stream().filter(n -> n.dc.equals(localDc)).count(); return l >= bf; }
            case "EACH_QUORUM":
                if (nts) { for (String dc : dcRf.keySet()) { long l = live.stream().filter(n -> n.dc.equals(dc)).count(); if (l < localQuorumFor(dc)) return false; } return true; }
            default: return live.size() >= bf;
        }
    }

    static byte[] hex(String s) { if (s.equals("-")) return new byte[0]; byte[] b = new byte[s.length()/2]; for (int i=0;i<b.length;i++) b[i]=(byte)Integer.parseInt(s.substring(2*i,2*i+2),16); return b; }

    public static void main(String[] a) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "TOKEN": out.println(token(hex(p[1]))); break;
                case "RESET": ring.clear(); nodes.clear(); dcRf.clear(); break;
                case "NODE": { Node n = new Node(); n.id=p[1]; n.dc=p[2]; n.rack=p[3]; n.up=p[4].equals("UP"); nodes.put(n.id,n);
                    for (String t : p[5].split(",")) { if (ring.put(Long.parseLong(t), n) != null) throw new IllegalStateException("duplicate token " + t); } break; }
                case "STATUS": nodes.get(p[1]).up = p[2].equals("UP"); break;
                case "STRATEGY": if (p[1].equals("SIMPLE")) { nts=false; simpleRf=Integer.parseInt(p[2]); } else { nts=true; dcRf.clear(); for (String kv : p[2].split(",")) { String[] x=kv.split(":"); dcRf.put(x[0], Integer.parseInt(x[1])); } } break;
                case "REPLICAS": { StringJoiner j = new StringJoiner(","); for (Node n : replicas(Long.parseLong(p[1]))) j.add(n.id); out.println(j); break; }
                case "CL": { List<Node> r = replicas(Long.parseLong(p[1])); out.println(blockFor(p[2], p[3]) + " " + (sufficient(r, p[2], p[3]) ? "OK" : "UNAVAILABLE")); break; }
                case "OWN": { // Murmur3Partitioner.describeOwnership: each token owns (prev, t], wrapping; divided by 2^64
                    java.math.BigInteger RS = java.math.BigInteger.ONE.shiftLeft(64); Map<String, java.math.BigInteger> own = new LinkedHashMap<>();
                    for (Node n : nodes.values()) own.put(n.id, java.math.BigInteger.ZERO);
                    Long prev = ring.lastKey();
                    for (Long t : ring.keySet()) { java.math.BigInteger w = java.math.BigInteger.valueOf(t).subtract(java.math.BigInteger.valueOf(prev)).mod(RS); if (ring.size()==1) w = RS; own.merge(ring.get(t).id, w, java.math.BigInteger::add); prev = t; }
                    StringJoiner j = new StringJoiner(","); for (Map.Entry<String, java.math.BigInteger> e : own.entrySet()) j.add(e.getKey()+"="+new java.math.BigDecimal(e.getValue()).divide(new java.math.BigDecimal(RS), 12, java.math.RoundingMode.HALF_EVEN).toPlainString());
                    out.println(j); break; }
                default: if (!p[0].isEmpty()) throw new IllegalArgumentException(line);
            }
        }
        out.flush();
    }
}
