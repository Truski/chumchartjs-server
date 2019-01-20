const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const cors = require('cors');
const randomstring = require('randomstring');
const multer = require('multer');

randomString = function(length) {
    return randomstring.generate({
        length: length,
        charset: 'alphabetic',
        capitalization: 'uppercase'
    });
}

var storage = multer.diskStorage({
    destination: '../chumchart-frontend/src/assets/img/people/',
    filename: function(req, file, cb) {
        cb(null, randomString(10) + '.png');
    }
});

var upload = multer({ 
    storage: storage,
    limits: {
        fieldSize: 5 * 1024 * 1024
    }
});

const mongoURL = 'mongodb://localhost:27017';
const mongoDB = 'chumchart';

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.listen(8000, () => {
    console.log('Server started!');
});

function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

app.route('/api/questions').get((req, res) => {
    setTimeout(function() {
        MongoClient.connect(mongoURL, function (err, db) {
            if (err) throw err;
            var dbo = db.db(mongoDB);
            var query = {};
            dbo.collection("questions").find(query).toArray(function (err, result) {
                if (err) throw err;
                res.send(shuffle(result));
                db.close();
            });
        });
    }, 250);
});

app.route('/api/chart/:chartCode').get((req, res) => {
    MongoClient.connect(mongoURL, function (err, db) {
        if (err) throw err;
        var dbo = db.db(mongoDB);
        var query = { code: req.params['chartCode'] };
        console.log(query);
        dbo.collection('charts').find(query).toArray(function (err, result) {
            if (err) throw err;
            console.log(result);
            if (result.length == 0) {
                res.send({status: "Failure"});
            } else if (result.length == 1) {
                res.send({ status: "Success", chart: result[0]} );
            }
        })
    })
});

app.route('/api/chartstatus/:chartCode').get((req, res) => {
    MongoClient.connect(mongoURL, function (err, db) {
        if (err) throw err;
        var dbo = db.db(mongoDB);
        var query = { code: req.params['chartCode'] };
        dbo.collection("quizzes").find(query).toArray(function (err, result) {
            if (err) throw err;
            console.log(result.length);
            if (result.length == 9) {
                res.send({ status: 'Complete' });
            } else if (result.length == 0) {
                res.send({ status: 'Nonexistent' });
            } else {
                res.send({ status: 'Incomplete' });
            }
            db.close();
        });
    });
})

app.route('/api/quiz').post(upload.single('image'), (req, res) => {
    console.log('We got something!');
    const quiz = req.body;
    console.log(quiz);
    console.log(req.file.filename);
    quiz.filename = req.file.filename;
    var response = {};
    if (quiz.code === 'undefined') {
        response.isLastPerson = false;
        response.peopleLeft = 8;
        response.chartCode = randomString(5);;
        quiz.code = response.chartCode;
        MongoClient.connect(mongoURL, function (err, db) {
            if (err) throw err;
            var dbo = db.db(mongoDB);
            dbo.collection('quizzes').insertOne(quiz, function (err, result) {
                if (err) throw err;
                res.status(201).send(response);
                return;
            });
        });
    } else {
        response.chartCode = quiz.code;

        MongoClient.connect(mongoURL, function (err, db) {
            if (err) throw err;
            var dbo = db.db(mongoDB);
            var query = { code: quiz.code };
            dbo.collection("quizzes").find(query).toArray(function (err, result) {
                if (err) throw err;
                if (result.length == 8) {
                    response.isLastPerson = true;
                    response.peopleLeft = 0;
                    dbo.collection('quizzes').insertOne(quiz, function(err, result2) {
                        result.push(quiz);
                        var alignments = generateChart(result);
                        alignments.code = response.chartCode;
                        dbo.collection('charts').insertOne(alignments, function(err, result3) {
                            res.status(201).send(response);
                            return;
                        })
                    });        
                }  else if (result.length == 9) {
                    response.peopleLeft = -1;
                    res.status(201).send(response);
                } else {
                    response.isLastPerson = false;
                    response.peopleLeft = 8 - result.length;
                    dbo.collection('quizzes').insertOne(quiz, function(err, result) {
                        if (err) throw err;
                        res.status(201).send(response);
                        return;
                    })
                }
            });
        });
    }
});

function generateChart(points) {
    var bestPerm = align(points);
    var result = {
        lg: bestPerm[2].filename,
        ln: bestPerm[5].filename,
        le: bestPerm[8].filename,
        ng: bestPerm[1].filename,
        tn: bestPerm[4].filename,
        ne: bestPerm[7].filename,
        cg: bestPerm[0].filename,
        cn: bestPerm[3].filename,
        ce: bestPerm[6].filename,
    }
    return result;
}

function align(points) {
    fixed = [
        { ethic: -1, moral: 1 },
        { ethic: 0, moral: 1 },
        { ethic: 1, moral: 1 },
        { ethic: -1, moral: 0 },
        { ethic: 0, moral: 0 },
        { ethic: 1, moral: 0 },
        { ethic: -1, moral: -1 },
        { ethic: 0, moral: -1 },
        { ethic: 1, moral: -1 }
    ];

    var min = 10000;
    var bestPerm = points;
    for (var i = 0; i < 362880; i++) {
        var d = calcDistance(points, fixed);
        if (d < min) {
            min = d;
            bestPerm = points;
        }
        points = nextPermutation(points);
    }
    return bestPerm;
}

function nextPermutation(points) {
    var i = 7;
    while (i >= 0 && greaterThan(points[i], points[i + 1])) {
        i--;
    }

    if (i < 0) {
        points = reverse(points, 0, 8);
    } else {
        var j = 8;
        while ((j > i + 1) && greaterThan(points[i], points[j])) {
            j--;
        }
        points = swap(points, i, j);
        points = reverse(points, i + 1, 8);
    }
    return points;
}

function greaterThan(point1, point2) {
    if (point1.ethic == point2.ethic) {
        return point1.moral >= point2.moral;
    } else {
        return point1.ethic > point2.ethic;
    }
}

function reverse(elements, i, j) {
    for (var x = 0; x < Math.round((j - i) / 2); x++) {
        elements = swap(elements, i + x, j - x);
    }
    return elements;
}

function swap(elements, i, j) {
    var temp = elements[i];
    elements[i] = elements[j];
    elements[j] = temp;
    return elements;
}

function calcDistance(points1, points2) {
    var distance = 0;
    for (var i = 0; i < 9; i++) {
        distance += distanceBetween(points1[i], points2[i]);
    }
    return distance;
}

function distanceBetween(p1, p2) {
    return Math.pow((p1.ethic - p2.ethic), 2) + Math.pow(p1.moral - p2.moral, 2);
}