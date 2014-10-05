package Photo::SlideShow;

use strict;
use warnings;
use v5.14;

use JSON::XS;
use File::Find;
use Throw;
use Data::Debug;

use Mo qw'build default builder coerce is required';

has photo_library => ( builder => 'find_library' );
has slideshow_dir => ( default => '/usr/local/pi_slide_show' );

sub find_library {
    my ($self) = @_;

    # look in some sensible locations
    my $dir;
    for (qw(/mnt/photo /media/photo /Volumes/photo)) {
        if (-d $_) {
            $dir = $_;
            last;
        }
    }
    throw "Missing photo_library" unless $dir;
    return $dir;
}

sub generate_list_system {
    my ($self, $args) = @_;
    $args ||= {};

    my $count = $args->{'count'};
    $count ||= 25;

    my $shuf = `which shuf gshuf`;
    chomp $shuf;
    debug($shuf);
    throw "missing gnu shuf.  If you are on OSX try 'brew install coreutils'" unless $shuf;

    my $photo_lib = $self->photo_library;
    debug "trying to find a random directory";
    my $dir = `find $photo_lib -type d -not -iwholename ".*" | $shuf -n1`;
    debug($dir);

    my $files = `find $dir -type f -exec file {} \\; | grep -o -P '^.+ \\w+ image' | $shuf -n$count`;
    debug($files);
}

sub generate_list_perl {
    my ($self, $args) = @_;
}

my $ss = Photo::SlideShow->new();
debug $ss->photo_library;
$ss->generate_list_system({ count => 25 });



1;
