#!/usr/bin/env python3
"""Collect tokens and replicas from a real Cassandra cluster and compare them
with CassLab's predictions (expected_casslab.csv).

Run this on one of the Cassandra nodes (for example M1), where `cqlsh` and
`nodetool` are available. Python 3.8+, no extra package needed.

    python3 collect_and_compare.py --cluster C2 --machines machines.csv

machines.csv maps the IP addresses printed by nodetool to machine names:

    name,ip
    M1,192.168.1.11
    M2,192.168.1.12
    ...

Output: results_<cluster>.csv, with Cassandra's values next to CassLab's,
and a summary printed on screen.
"""
import argparse
import csv
import re
import subprocess
import sys

TOKEN_RE = re.compile(r"^\s*(-?\d+)\s*$", re.M)


def run(cmd):
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"Command failed: {' '.join(cmd)}\n{out.stderr}")
    return out.stdout


def cql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def cassandra_token(host, ks, table, key):
    if table == "t_text":
        query = f"SELECT token(k) FROM {ks}.t_text WHERE k = {cql_literal(key)};"
    elif table == "t_int":
        query = f"SELECT token(k) FROM {ks}.t_int WHERE k = {int(key)};"
    else:
        k1, k2 = key.rsplit("|", 1)
        query = f"SELECT token(k1, k2) FROM {ks}.t_comp WHERE k1 = {cql_literal(k1)} AND k2 = {int(k2)};"
    out = run(["cqlsh", host, "-e", query])
    found = TOKEN_RE.findall(out)
    return found[0] if found else ""


def cassandra_endpoints(ks, table, key, ip_to_name):
    # nodetool expects composite partition keys as "k1:k2"
    nkey = key.replace("|", ":") if table == "t_comp" else key
    out = run(["nodetool", "getendpoints", ks, table, nkey])
    ips = [line.strip() for line in out.splitlines() if line.strip()]
    return " ".join(ip_to_name.get(ip.split(":")[0], ip) for ip in ips)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cluster", required=True, choices=["C1", "C2"])
    ap.add_argument("--machines", required=True, help="CSV with columns name,ip")
    ap.add_argument("--host", default="127.0.0.1", help="cqlsh host (default: local node)")
    ap.add_argument("--expected", default="expected_casslab.csv")
    args = ap.parse_args()

    with open(args.machines, newline="") as f:
        ip_to_name = {row["ip"].strip(): row["name"].strip() for row in csv.DictReader(f)}

    with open(args.expected, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["cluster"] == args.cluster]

    out_rows, tok_ok, set_ok, order_ok = [], 0, 0, 0
    for r in rows:
        tok = cassandra_token(args.host, r["keyspace"], r["table"], r["key"])
        eps = cassandra_endpoints(r["keyspace"], r["table"], r["key"], ip_to_name)
        exp = r["casslab_replicas_in_order"].split()
        got = eps.split()
        t_match = tok == r["casslab_token"]
        s_match = sorted(exp) == sorted(got)
        o_match = exp == got
        tok_ok += t_match
        set_ok += s_match
        order_ok += o_match
        out_rows.append({**r, "cassandra_token": tok, "cassandra_replicas": eps,
                         "token_match": t_match, "replica_set_match": s_match,
                         "primary_match": bool(got) and exp[0] == got[0], "order_match": o_match})

    out_file = f"results_{args.cluster}.csv"
    with open(out_file, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    n = len(out_rows)
    prim = sum(r["primary_match"] for r in out_rows)
    print(f"{args.cluster}: {n} (key, keyspace) pairs")
    print(f"  tokens identical      : {tok_ok}/{n}")
    print(f"  replica sets identical: {set_ok}/{n}")
    print(f"  primary replica equal : {prim}/{n}")
    print(f"  replica order equal   : {order_ok}/{n}")
    print(f"  details in {out_file}")


if __name__ == "__main__":
    main()
