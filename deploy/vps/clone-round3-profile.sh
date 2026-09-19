#!/bin/sh
set -eu
umask 077

source_profile=/home/cloudbrowser/.config/brave-cloud-browser
destination_profile=/home/cloudbrowser/.config/brave-mast-round3

for command_line in /proc/[0-9]*/cmdline; do
  [ -r "$command_line" ] || continue
  executable=$(/usr/bin/tr '\0' '\n' <"$command_line" 2>/dev/null | /usr/bin/sed -n '1p' || true)
  case "$executable" in
    */brave|*/brave-browser)
      if /usr/bin/tr '\0' '\n' <"$command_line" 2>/dev/null \
          | /usr/bin/grep -F -x -- "--user-data-dir=$source_profile" >/dev/null 2>&1; then
        echo SOURCE_PROFILE_IS_OPEN >&2
        exit 1
      fi
      ;;
  esac
done
if [ -e "$destination_profile" ]; then
  echo DESTINATION_PROFILE_ALREADY_EXISTS >&2
  exit 1
fi
if [ "$(/usr/bin/stat -c %U "$source_profile")" != cloudbrowser ]; then
  echo SOURCE_PROFILE_OWNER_INVALID >&2
  exit 1
fi

/usr/bin/install -d -m 0700 -o cloudbrowser -g cloudbrowser "$destination_profile"
/usr/bin/rsync -a \
  --exclude=SingletonCookie \
  --exclude=SingletonLock \
  --exclude=SingletonSocket \
  --exclude='*/Cache/*' \
  --exclude='*/Code Cache/*' \
  --exclude='*/GPUCache/*' \
  "$source_profile/" "$destination_profile/"
/usr/bin/chown -R cloudbrowser:cloudbrowser "$destination_profile"
/usr/bin/find "$destination_profile" -type d -exec chmod go-rwx {} +
/usr/bin/find "$destination_profile" -type f -exec chmod go-rwx {} +

private_environment=/home/cloudbrowser/.local/share/askrigor-mast-round3/environment
/usr/bin/install -d -m 0700 -o cloudbrowser -g cloudbrowser "$private_environment"
temporary_directory=$(/usr/bin/mktemp -d)
trap '/usr/bin/rm -rf "$temporary_directory"' EXIT
(
  cd "$source_profile"
  /usr/bin/find . -type f \
    ! -name 'Singleton*' \
    ! -path '*/Cache/*' \
    ! -path '*/Code Cache/*' \
    ! -path '*/GPUCache/*' -print0 \
    | LC_ALL=C /usr/bin/sort -z \
    | /usr/bin/xargs -0 -r /usr/bin/sha256sum
) >"$temporary_directory/source-files.sha256"
(
  cd "$destination_profile"
  /usr/bin/find . -type f \
    ! -name 'Singleton*' \
    ! -path '*/Cache/*' \
    ! -path '*/Code Cache/*' \
    ! -path '*/GPUCache/*' -print0 \
    | LC_ALL=C /usr/bin/sort -z \
    | /usr/bin/xargs -0 -r /usr/bin/sha256sum
) >"$temporary_directory/destination-files.sha256"
/usr/bin/cmp "$temporary_directory/source-files.sha256" "$temporary_directory/destination-files.sha256"
manifest_sha256=$(/usr/bin/sha256sum "$temporary_directory/source-files.sha256" | /usr/bin/cut -d ' ' -f 1)
file_count=$(/usr/bin/wc -l <"$temporary_directory/source-files.sha256")
cloned_at=$(/usr/bin/date --utc +%Y-%m-%dT%H:%M:%SZ)
/usr/bin/printf '{\n  "schemaVersion": 1,\n  "studyId": "askrigor-mast-fresh-validation-round-3-20260919",\n  "sourceProfile": "%s",\n  "destinationProfile": "%s",\n  "owner": "cloudbrowser",\n  "sourceDestinationManifestEqual": true,\n  "fileCount": %s,\n  "manifestSha256": "%s",\n  "clonedAt": "%s"\n}\n' \
  "$source_profile" "$destination_profile" "$file_count" "$manifest_sha256" "$cloned_at" \
  >"$private_environment/profile-genesis.json"
/usr/bin/chown cloudbrowser:cloudbrowser "$private_environment/profile-genesis.json"
/usr/bin/chmod 0600 "$private_environment/profile-genesis.json"
