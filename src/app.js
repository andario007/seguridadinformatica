require('dotenv').config();
const express = require('express');
const {Router} = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const CryptoJS = require("crypto-js");

app.use(express.json());
app.use(cors({
    origin: '*'
}));

const router = Router();
router.post('/login', (req, res) => {
    let {username, password} = req.body;
    const connection = connectDb();
    password = CryptoJS.HmacSHA256(password, process.env.API_KEY).toString();

    /*const bytes  = CryptoJS.AES.decrypt(password, process.env.API_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);*/


    const query = connection.query(`SELECT * FROM user WHERE user.username = '${username}' AND user.password = '${password}' LIMIT 1`, async (error, results, fields) => {
        try {
            if (error) throw error;
            if (results.length > 0) {
                const user = results[0];
                const person = await getPerson(user) || null;
                const profiles = await getProfiles(user) || [];
                const data = {
                    userId: results[0].id, access_token: generateToken(user, person), person, profiles
                }
                res.json({...data})
            } else {
                res.status(401).json({message: 'Error en las crendeciales'})
            }
        } catch (e) {
            res.status(500).json({message: e})
        }
    });
    connection.end();
});

router.get('/teacher/subjects', async (req, res) => {
    const tokenDecode = decodeToken(req);
    console.log('tokenDecode', tokenDecode)
    let subjects = null;
    if (tokenDecode) {
        subjects = await getTeacherSubjects(tokenDecode.personId);
        console.log('subjects', subjects)
        const map = subjects.map(subject => {
            return {
                id: subject.teacher_subjects_id,
                subjectId: subject.subject_id,
                personId: subject.person_id,
                currentSemesterId: subject.current_semester_id,
                subject: {
                    id: subject.id,
                    code: subject.code,
                    name: subject.name,
                    status: subject.status,
                    credits: subject.credits,
                    dependencySubjectId: subject.dependency_subject_id
                }
            }
        })
        res.json({
            error: false,
            message: "",
            data: map
        });
    } else {
        res.status(401).json({
            error: true,
            message: "Token no valido",
            data: null
        });
    }


});

app.use(router);

app.listen(PORT, () => {
    console.log(`Listen server in http://localhost:${PORT}`);
})

function getPerson(user) {
    const connection = connectDb();
    return new Promise(function (resolve, reject) {
        connection.query(`SELECT * FROM PERSON WHERE PERSON.ID = ${user.person_id}`, function (err, results) {
            if (err) {
                reject({
                    error: true, data: null, message: err,
                });
            } else {
                connection.end();
                resolve(results[0]);
            }
        });
    });
}

function getProfiles(user) {
    const connection = connectDb();
    return new Promise(function (resolve, reject) {
        connection.query(`SELECT profile.name, profile.status FROM profile INNER JOIN user_profiles ON profile.id = user_profiles.profile_id WHERE user_profiles.user_id = ${user.id}`, function (err, results) {
            if (err) {
                reject({
                    error: true, data: null, message: err,
                });
            } else {
                connection.end();
                const profiles = results.map(profile => {
                    return {
                        profile
                    }
                })
                resolve(profiles);
            }
        });
    });
}

function getTeacherSubjects(personId) {
    const connection = connectDb();
    return new Promise(function (resolve, reject) {
        const query = `SELECT teacher_subjects.id as teacher_subjects_id, teacher_subjects.subject_id, teacher_subjects.person_id, teacher_subjects.current_semester_id, subject.id, subject.code, subject.name, subject.status, subject.credits FROM teacher_subjects INNER JOIN subject ON teacher_subjects.subject_id = subject.id WHERE teacher_subjects.person_id = ${personId}`
        connection.query(query, function (err, results) {
            if (err) {
                reject({
                    error: true, data: null, message: err,
                });
            } else {
                connection.end();
                resolve(results);
            }
        });
    });
}

function connectDb() {
    const connection = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });
    connection.connect();
    return connection;
}

function generateToken(user, person) {
    return jwt.sign({
        exp: Math.floor(Date.now() / 1000) + (60 * 60), userId: user?.id, personId: person?.id
    }, process.env.API_KEY);
}

function decodeToken(req) {
    let token = null;
    console.log('req', req.headers)
    if (req.headers.authorization) {
        token = req.headers.authorization.split(' ')[1];
    } else {
        return token;
    }
    try {
        return jwt.verify(token, process.env.API_KEY);
    } catch (err) {
        return token;
    }
}