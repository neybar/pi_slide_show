FROM perl:5

ENV DIR=/usr/src/pi_slide_show
RUN cpanm Carton && mkdir -p $DIR
WORKDIR $DIR

COPY cpanfile* $DIR
RUN carton install
COPY . $DIR

CMD [ "carton", "exec", "--", "./generate_slideshow.pl" ]
