var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var syncFromDisk = require('../../sync/syncFromDisk');
var requireFrontend = require('../../lib/require-frontend');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {course_id: res.locals.course.id};
    sqldb.query(sql.select_sync_job_sequences, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job_sequences = result.rows;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

var pullAndUpdate = function(locals, callback) {
    var params = {
        course_id: locals.course.id,
        user_id: locals.user.id,
        authn_user_id: locals.authz_data.authn_user.id,
        type: 'sync',
        description: 'Sync from remote git repository',
    };
    sqldb.queryOneRow(sql.insert_job_sequence, params, function(err, result) {
        if (ERR(err, callback)) return;
        var job_sequence_id = result.rows[0].id;
        
        var syncStage2 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.id,
                authn_user_id: locals.authz_data.authn_user.id,
                type: 'sync_from_disk',
                description: 'Sync git repository to database',
                job_sequence_id: job_sequence_id,
                on_success: syncStage3,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                syncFromDisk.syncDiskToSql(locals.course.path, job, function(err) {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        var syncStage3 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.id,
                authn_user_id: locals.authz_data.authn_user.id,
                type: 'reload_question_servers',
                description: 'Reload question server.js code',
                job_sequence_id: job_sequence_id,
                last_in_sequence: true,
            };
            serverJobs.createJob(jobOptions, function(err, job) {
                var coursePath = locals.course.path;
                requireFrontend.undefQuestionServers(coursePath, job, function(err) {
                    if (err) {
                        job.fail(err);
                    } else {
                        job.succeed();
                    }
                });
            });
        };

        var jobOptions = {
            course_id: locals.course.id,
            user_id: locals.user.id,
            authn_user_id: locals.authz_data.authn_user.id,
            job_sequence_id: job_sequence_id,
            type: 'pull_from_git',
            description: 'Pull from remote git repository',
            command: 'git',
            arguments: ['pull', '--force', 'origin', 'master'],
            working_directory: locals.course.path,
            on_success: syncStage2,
        };
        serverJobs.spawnJob(jobOptions, function(err, job) {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);
        });
    });
};

var gitStatus = function(locals, callback) {
    var params = {
        course_id: locals.course.id,
        user_id: locals.user.id,
        authn_user_id: locals.authz_data.authn_user.id,
        type: 'git_status',
        description: 'Show status of server git repository',
    };
    sqldb.queryOneRow(sql.insert_job_sequence, params, function(err, result) {
        if (ERR(err, callback)) return;
        var job_sequence_id = result.rows[0].id;

        var statusStage2 = function() {
            var jobOptions = {
                course_id: locals.course.id,
                user_id: locals.user.id,
                authn_user_id: locals.authz_data.authn_user.id,
                type: 'git_history',
                description: 'List git history',
                job_sequence_id: job_sequence_id,
                command: 'git',
                arguments: ['log', '--all', '--graph', '--date=short', '--format=format:%h %cd%d %cn %s'],
                working_directory: locals.course.path,
                last_in_sequence: true,
            };
            serverJobs.spawnJob(jobOptions, function(err, job) {
                if (ERR(err, function() {})) return logger.error('statusStage2 error', err);
            });
        };

        var jobOptions = {
            course_id: locals.course.id,
            user_id: locals.user.id,
            authn_user_id: locals.authz_data.authn_user.id,
            job_sequence_id: job_sequence_id,
            type: 'describe_git',
            description: 'Describe current git HEAD',
            command: 'git',
            arguments: ['show', '--format=fuller', '--no-patch', 'HEAD'],
            working_directory: locals.course.path,
            on_success: statusStage2,
        };
        serverJobs.spawnJob(jobOptions, function(err, job) {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);
        });
    });
};

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_admin_edit) return next();
    if (req.body.postAction == 'pull') {
        pullAndUpdate(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/admin/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.postAction == 'status') {
        gitStatus(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/admin/jobSequence/' + job_sequence_id);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
