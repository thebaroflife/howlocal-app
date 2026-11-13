# Lists California places that Overture Maps marks as closed (permanently or for now).
# Overture's places data is free and open (CDLA Permissive 2.0 / Apache 2.0 / CC0); read anonymously
# from its public bucket. Used by the listings build to drop closed spots. GitHub Actions only.
#   python scripts/overture-closed.py out.json [name-to-look-up ...]
import json, re, sys
import duckdb
import pyarrow.fs as pafs

BUCKET = "overturemaps-us-west-2"
CA = dict(west=-124.5, east=-114.0, south=32.4, north=42.1)

fs = pafs.S3FileSystem(anonymous=True, region="us-west-2")
releases = sorted(
    i.base_name
    for i in fs.get_file_info(pafs.FileSelector(f"{BUCKET}/release/", recursive=False))
    if i.type == pafs.FileType.Directory and re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", i.base_name)
)
if not releases:
    sys.exit("no Overture releases found")
release = releases[-1]
src = f"s3://{BUCKET}/release/{release}/theme=places/type=place/*"
print(f"overture: release {release}")

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
where = (
    f"bbox.xmin BETWEEN {CA['west']} AND {CA['east']} AND bbox.ymin BETWEEN {CA['south']} AND {CA['north']}"
    " AND names.primary IS NOT NULL"
)
# California places, once; then the closed ones that have no open twin nearby (a business that
# moved next door or was re-listed keeps its open record).
con.execute(
    f"""CREATE TABLE ca AS
        SELECT names.primary AS name, lower(names.primary) AS n, bbox.ymin AS lat, bbox.xmin AS lon,
               operating_status AS status
        FROM read_parquet('{src}', hive_partitioning=1) WHERE {where}"""
)
print("overture:", con.execute("SELECT count(*) FROM ca").fetchone()[0], "California places")
rows = con.execute(
    """SELECT c.name, round(c.lat, 6), round(c.lon, 6), c.status
       FROM ca c
       WHERE c.status IN ('permanently_closed', 'temporarily_closed')
         AND NOT EXISTS (
           SELECT 1 FROM ca o
           WHERE o.n = c.n AND (o.status = 'open' OR o.status IS NULL)
             AND abs(o.lat - c.lat) < 0.0008 AND abs(o.lon - c.lon) < 0.0008)"""
).fetchall()
closed = [{"name": n, "lat": la, "lon": lo, "status": s} for n, la, lo, s in rows]
by_status = {}
for c in closed:
    by_status[c["status"]] = by_status.get(c["status"], 0) + 1
print(f"overture: {len(closed)} closed places in California with no open twin {json.dumps(by_status)}")

for name in sys.argv[2:]:
    found = con.execute(
        f"""SELECT names.primary, round(bbox.ymin, 5), round(bbox.xmin, 5), operating_status, round(confidence, 2)
            FROM read_parquet('{src}', hive_partitioning=1)
            WHERE {where} AND names.primary ILIKE ?""",
        [f"%{name}%"],
    ).fetchall()
    print(f"overture: look-up '{name}':", found[:5])

with open(sys.argv[1], "w") as f:
    json.dump({"release": release, "closed": closed}, f)
