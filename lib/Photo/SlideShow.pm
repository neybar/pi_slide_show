package Photo::SlideShow;

use strict;
use warnings;
use v5.14;
use autodie;

use JSON::XS;
use Image::ExifTool qw(ImageInfo);
use File::Find;
use Throw;
use Data::Debug;

use Mo qw'build default builder is required';

has photo_library => ( builder => 'find_library' );
has default_count => ( default => 25 );
has output_file   => ( required => 1 );
has web_photo_dir => ( required => 1 );

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
    $count ||= $self->default_count;

    my $shuf = `which shuf gshuf`;
    chomp $shuf;
    throw "missing gnu shuf.  If you are on OSX try 'brew install coreutils'" unless $shuf;

    my $photo_lib = $self->photo_library;
    my $dir = `find '$photo_lib' -type d -not -iwholename ".*" -not -path "*/iPhoto Library/*" | $shuf -n1`;
    chomp $dir;

    my $cmd = "find '$dir' -type f -exec file {} \\; | grep 'image data' | cut -d: -f1 | $shuf -n$count";
    my $web = $self->web_photo_dir;
    my @files = map {chomp; $_} `$cmd`;

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
        images => []
    };

    foreach my $file (@$files) {
         my $info = ImageInfo($file, ["Orientation"], { PrintConv => 0 });
         $info->{'file'} = $file;
         my $lib = $self->photo_library;
         my $web = $self->web_photo_dir;
         $info->{'file'} =~ s/$lib/$web/;

         push(@{ $data->{'images'} }, $info);
         #$data->{'images'}->{$file} = $info;
    }

    my $json = JSON::XS::encode_json($data);

    my $output = $args->{'output_file'} || $self->output_file;
    open(my $fh, ">", $output);

    print $fh $json;

    close($fh);
}

1;
