-- Enforce a storage ceiling as well as client compression. Existing objects
-- remain available; PDFs/private evidence retain their separate 5 MiB policy.
update storage.buckets
set file_size_limit = least(coalesce(file_size_limit, 3145728), 3145728)
where id = 'spot-images';

update storage.buckets
set file_size_limit = least(coalesce(file_size_limit, 262144), 262144)
where id = 'profile-photos';
