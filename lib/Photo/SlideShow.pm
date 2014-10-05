package Photo::SlideShow;

use strict;
use warnings;
use v5.14;

use JSON::XS;
use Image::ExifTool qw(ImageInfo);
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
    my $dir = `find '$photo_lib' -type d -not -iwholename ".*" | $shuf -n1`;
    chomp $dir;
    debug($dir);

    my $cmd = "find '$dir' -type f -exec file {} \\; | grep 'image data' | cut -d: -f1 | $shuf -n$count";
    debug $cmd;
    my @files = map {chomp; $_} `$cmd`;
    debug(\@files);

    $self->print_json_exif({ files => \@files });
}

sub generate_list_perl {
    my ($self, $args) = @_;
}

sub print_json_exif {
    my ($self, $args) = @_;
    
    my $files = $args->{'files'};

    my $data = { 
        count  => scalar @$files,
        images => {},
    };
    debug $data;
    foreach my $file (@$files) {
         my $info = ImageInfo($file);

         # remove the thumbnail
         delete $info->{'ThumbnailImage'};
         delete $info->{'ThumbnailOffset'};
         delete $info->{'ThumbnailLength'};

         $data->{'images'}->{$file} = $info;
    }
    debug($data);

    my $json = JSON::XS::encode_json($data);
    debug $json;
}

my $ss = Photo::SlideShow->new();
debug $ss->photo_library;
$ss->generate_list_system({ count => 25 });



1;
