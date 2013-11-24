trap "exit" int

etag=`mktemp`

while true; do
  curl -v ${inm:+-H "If-None-Match: $inm"} localhost:3000$1 -D >(sed -rn 's/^Etag:\s*//p' > $etag)
  if [ $? == 0 ]; then
    pinm=`cat $etag`
    inm=${pinm:-$inm}
    sleep ${2-0}
  else
    exit
  fi
done
