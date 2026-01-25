#!/usr/bin/env perl

use strict;
use warnings;

use FindBin qw($Bin);
use lib "$Bin/lib";
use Photo::SlideShow;
use YAML::XS;
use Data::Debug;
use File::Flock::Tiny;

my $pid = File::Flock::Tiny->trylock("$Bin/generate_slideshow.pid") or die "Already running";

my $config = {};
if (-e "$Bin/generate_slideshow.yml") {
    $config = YAML::XS::LoadFile("$Bin/generate_slideshow.yml");
}

$config->{'output_file'} ||= "$Bin/www/slideshow.json";
$config->{'bg_sleep'}    ||= 15 * 60; #15 minute default
$config->{'background'}  = 0 unless defined $config->{'background'};

my $ss = Photo::SlideShow->new(%$config);

if ($config->{'background'}) {
    while (1) {
        $ss->generate_list_perl();
        sleep($config->{'bg_sleep'});
    }
} else {
    $ss->generate_list_perl();
}
