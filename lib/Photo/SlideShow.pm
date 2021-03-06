package Photo::SlideShow;

use strict;
use warnings;
use v5.14;
use autodie;

use JSON::XS;
use Image::ExifTool qw(ImageInfo);
use File::Find;
use File::Type;
use Throw;
use Data::Debug;
use List::Util qw(shuffle);

# Need this for SMB3.  I think newer versions of Perl and File::Find fix this
$File::Find::dont_use_nlink=1;

use Mo qw'build default builder is required';

has photo_library => ( builder => 'find_library' );
has default_count => ( default => 25 );
has output_file   => ( required => 1 );
has web_photo_dir => ( required => 1 );

my @dirs;  #global for Find::Find;
my @files; #global for File::Find;

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
    my @files = map {chomp; $_} `$cmd`;

    $self->print_json_exif({ files => \@files });
}

sub generate_list_perl {
    my ($self, $args) = @_;

    my $count = $args->{'count'};
    $count ||= $self->default_count;

    @dirs = ();
    File::Find::find({wanted => \&find_dirs}, $self->photo_library);

    @files = ();
    my @images;
    my $max_tries = 0;
    until (scalar @files) {
        last if $max_tries++ > 10;
        my $dir = $dirs[ rand @dirs ];
        File::Find::find({wanted => \&find_files}, $dir);
        @images = grep{defined} (shuffle @files)[0..($count-1)];
    }

    $self->print_json_exif({ files => \@images}) if scalar @images;
}

sub find_dirs {
    return if $File::Find::name =~ m/iPhoto Library/; #Skip the iPhoto Library
    return if $File::Find::name =~ m/eaDir/;        #Skip the Synology @eaDir
    return if $File::Find::name =~ m/\/\./;           #Skip files that have a "." in the filename

    if (-d) { #Only want the directories, thanks!
        push(@dirs, $File::Find::name);
    }
}

sub find_files {
    my $type = File::Type->mime_type($_);
    return if $File::Find::name =~ m/eaDir/;        #Skip the Synology @eaDir
    return unless $type;
    return if $type !~ /image/;

    push(@files, $File::Find::name);
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
